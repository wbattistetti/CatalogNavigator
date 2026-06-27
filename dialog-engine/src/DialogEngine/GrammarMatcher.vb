''' <summary>
''' Matches utterance text against category grammars (attributo) and resolution pipelines (vincolo).
''' </summary>
Imports System.Text.RegularExpressions

Public Module GrammarMatcher

    Public Function ConceptsFromCategoryGrammars(
        utterance As String,
        ontology As Models.Ontology
    ) As List(Of Models.Concept)
        Dim concepts As New List(Of Models.Concept)()
        If ontology Is Nothing OrElse ontology.Categories Is Nothing Then Return concepts

        Dim text = If(utterance, String.Empty).Trim().ToLowerInvariant()
        If text.Length = 0 Then Return concepts

        Dim categories = ontology.Categories.Where(Function(c) c IsNot Nothing).OrderBy(Function(c) c.Order)
        For Each category In categories
            If category Is Nothing Then Continue For

            If category.Kind = Models.ConceptKind.Vincolo Then
                Dim vincoloConcept = MatchVincoloResolution(text, category)
                If vincoloConcept IsNot Nothing Then concepts.Add(vincoloConcept)
                Continue For
            End If

            If category.Grammar Is Nothing OrElse String.IsNullOrWhiteSpace(category.Grammar.Regex) Then Continue For

            Dim rawMatches = MatchAllGrammarValues(text, category)
            If rawMatches.Count = 0 Then Continue For

            Dim resolved = CategoryValueResolution.ResolveAttributoValues(category, rawMatches)
            If resolved.Count = 0 Then Continue For

            concepts.Add(ValueSetOps.CreateAttributoConcept(category.Name, resolved))
        Next

        Return concepts
    End Function

    ''' <summary>
    ''' Returns every canonical value in the category that matches the utterance.
    ''' Each grammar mapping group is tested independently (aligned with TS matchAllCategoryGrammarValues).
    ''' </summary>
    Public Function MatchAllGrammarValues(
        text As String,
        category As Models.CategoryDefinition
    ) As List(Of String)
        Dim values As New List(Of String)()
        If category Is Nothing Then Return values

        Dim grammar = category.Grammar
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return values

        Dim seen As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)

        If grammar.Mappings IsNot Nothing AndAlso grammar.Mappings.Count > 0 Then
            Dim orderedCanonicals = If(category.AllowedValues, New List(Of String)())
            If orderedCanonicals.Count > 0 Then
                For Each canonical In orderedCanonicals
                    If String.IsNullOrWhiteSpace(canonical) Then Continue For
                    Dim groupName = FindMappingGroupName(grammar.Mappings, canonical)
                    If String.IsNullOrWhiteSpace(groupName) Then Continue For
                    TryAddGrammarMatch(text, grammar.Regex, groupName, canonical, category, seen, values)
                Next
            Else
                For Each kvp In grammar.Mappings
                    TryAddGrammarMatch(text, grammar.Regex, kvp.Key, kvp.Value, category, seen, values)
                Next
            End If
        Else
            Dim matched = MatchGrammar(text, category)
            If Not String.IsNullOrWhiteSpace(matched) AndAlso seen.Add(matched) Then
                values.Add(matched)
            End If
        End If

        Return DropShadowedByLongerMatches(values)
    End Function

    ''' <summary>
    ''' Removes shorter matched tokens contained as whole words inside a longer matched token
    ''' (e.g. "agonistica" inside "non agonistica").
    ''' </summary>
    Public Function DropShadowedByLongerMatches(values As IList(Of String)) As List(Of String)
        If values Is Nothing Then Return New List(Of String)()

        Dim cleaned = values.
            Where(Function(v) Not String.IsNullOrWhiteSpace(v)).
            Select(Function(v) v.Trim()).
            ToList()
        If cleaned.Count <= 1 Then Return cleaned

        Dim ordered = cleaned.
            OrderByDescending(Function(v) v.Length).
            ThenBy(Function(v) v, StringComparer.OrdinalIgnoreCase).
            ToList()

        Dim survivors As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        For Each candidate In ordered
            Dim shadowed = survivors.Any(Function(longer) IsShadowedByLongerMatch(candidate, longer))
            If Not shadowed Then survivors.Add(candidate)
        Next

        Dim result As New List(Of String)()
        For Each value In cleaned
            If survivors.Contains(value) AndAlso
               Not result.Any(Function(r) String.Equals(r, value, StringComparison.OrdinalIgnoreCase)) Then
                result.Add(value)
            End If
        Next

        Return result
    End Function

    Private Function IsShadowedByLongerMatch(shorter As String, longer As String) As Boolean
        If String.IsNullOrWhiteSpace(shorter) OrElse String.IsNullOrWhiteSpace(longer) Then Return False
        If shorter.Length >= longer.Length Then Return False

        Try
            Dim pattern = "(?<!\w)" & Regex.Escape(shorter.Trim()) & "(?!\w)"
            Return Regex.IsMatch(
                longer.Trim(),
                pattern,
                RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)
        Catch
            Return False
        End Try
    End Function

    Private Function FindMappingGroupName(
        mappings As Dictionary(Of String, String),
        canonical As String
    ) As String
        For Each kvp In mappings
            If String.Equals(kvp.Value, canonical, StringComparison.OrdinalIgnoreCase) Then
                Return kvp.Key
            End If
        Next
        Return Nothing
    End Function

    Private Function TryAddGrammarMatch(
        text As String,
        combinedRegex As String,
        groupName As String,
        canonical As String,
        category As Models.CategoryDefinition,
        seen As HashSet(Of String),
        values As List(Of String)
    ) As Boolean
        Dim groupPattern = TryExtractNamedGroupPattern(combinedRegex, groupName)
        If String.IsNullOrWhiteSpace(groupPattern) Then Return False

        Try
            If Not Regex.IsMatch(text, groupPattern, RegexOptions.IgnoreCase) Then Return False
        Catch
            Return False
        End Try

        Dim resolved = CategoryNormalization.ResolveCatalogValue(canonical, category)
        If String.IsNullOrWhiteSpace(resolved) Then Return False
        If Not seen.Add(resolved) Then Return False
        values.Add(resolved)
        Return True
    End Function

    ''' <summary>Extracts one named group's sub-pattern from a combined alternation regex.</summary>
    Public Function TryExtractNamedGroupPattern(combinedRegex As String, groupName As String) As String
        If String.IsNullOrWhiteSpace(combinedRegex) OrElse String.IsNullOrWhiteSpace(groupName) Then
            Return Nothing
        End If

        Dim marker = "(?<" & groupName & ">"
        Dim start = combinedRegex.IndexOf(marker, StringComparison.Ordinal)
        If start < 0 Then Return Nothing

        Dim contentStart = start + marker.Length
        Dim depth = 1
        Dim index = contentStart
        While index < combinedRegex.Length AndAlso depth > 0
            Dim ch = combinedRegex(index)
            If ch = "("c Then
                depth += 1
            ElseIf ch = ")"c Then
                depth -= 1
            End If
            index += 1
        End While

        If depth <> 0 Then Return Nothing
        Dim inner = combinedRegex.Substring(contentStart, index - contentStart - 1)
        Return "(?<" & groupName & ">" & inner & ")"
    End Function

    Private Function MatchVincoloResolution(text As String, category As Models.CategoryDefinition) As Models.Concept
        If category.Resolution IsNot Nothing Then
            Dim quantity = ResolutionRunner.RunForCategory(category, text)
            If quantity IsNot Nothing Then
                Return ValueSetOps.CreateVincoloConcept(
                    category.Name, quantity.Value.ToString(), quantity.Unit)
            End If
        End If

        Return Nothing
    End Function

    Private Function MatchGrammar(text As String, category As Models.CategoryDefinition) As String
        Dim grammar = category.Grammar
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return Nothing

        Try
            Dim match = Regex.Match(text, grammar.Regex, RegexOptions.IgnoreCase)
            If Not match.Success Then Return Nothing

            If grammar.Mappings IsNot Nothing Then
                For Each groupName In grammar.Mappings.Keys
                    Dim group = match.Groups(groupName)
                    If group.Success AndAlso Not String.IsNullOrEmpty(group.Value) Then
                        Return CategoryNormalization.ResolveCatalogValue(grammar.Mappings(groupName), category)
                    End If
                Next
            End If

            For Each group As Group In match.Groups
                If group.Name = "0" Then Continue For
                If group.Success AndAlso Not String.IsNullOrEmpty(group.Value) Then
                    Return CategoryNormalization.ResolveCatalogValue(group.Value, category)
                End If
            Next
        Catch
            Return Nothing
        End Try

        Return Nothing
    End Function

End Module
