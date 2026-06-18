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

            Dim canonical = MatchGrammar(text, category)
            If String.IsNullOrWhiteSpace(canonical) Then Continue For

            concepts.Add(New Models.Concept With {
                .Category = category.Name,
                .Value = canonical,
                .Kind = Models.ConceptKind.Attributo
            })
        Next

        Return concepts
    End Function

    Private Function MatchVincoloResolution(text As String, category As Models.CategoryDefinition) As Models.Concept
        If category.Resolution IsNot Nothing Then
            Dim quantity = ResolutionRunner.RunForCategory(category, text)
            If quantity IsNot Nothing Then
                Return New Models.Concept With {
                    .Category = category.Name,
                    .Value = quantity.Value.ToString(),
                    .Unit = quantity.Unit,
                    .Kind = Models.ConceptKind.Vincolo
                }
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
