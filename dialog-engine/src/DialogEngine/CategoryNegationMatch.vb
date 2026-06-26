''' <summary>
''' Matches negated category mentions (e.g. "senza ecg") and positive concepts on correction payload.
''' </summary>
Imports System.Text.RegularExpressions

Public Module CategoryNegationMatch

    Public Class CategoryNegationResult
        Public Property NegatedCategories As List(Of String) = New List(Of String)()
        Public Property PositiveConcepts As List(Of Models.Concept) = New List(Of Models.Concept)()
    End Class

    Private ReadOnly NegatorPrefix As String =
        "(?:senza|non\s+voglio(?:\s+il|\s+la|\s+l'|\s+lo)?|non|tolgo(?:\s+il|\s+la|\s+l'|\s+lo)?|niente|nessun[oa]?)\s+"

    Private ReadOnly OptionalArticle As String = "(?:l'|il\s+|la\s+|lo\s+|i\s+|gli\s+|le\s+)?"

    ''' <summary>Extracts categories to drop and attributi to merge from a correction payload.</summary>
    Public Function ExtractFromCorrectionPayload(
        payload As String,
        ontology As Models.Ontology
    ) As CategoryNegationResult
        Dim result As New CategoryNegationResult()
        If ontology Is Nothing OrElse ontology.Categories Is Nothing Then Return result

        Dim text = If(payload, String.Empty).Trim().ToLowerInvariant()
        If text.Length = 0 Then Return result

        Dim categoriesToRemove As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        For Each category In ontology.Categories.Where(Function(c) c IsNot Nothing).OrderBy(Function(c) c.Order)
            If category.Kind <> Models.ConceptKind.Attributo Then Continue For
            If TryMatchNegatedCategory(text, category) Then
                categoriesToRemove.Add(category.Name.Trim())
            End If
        Next

        result.NegatedCategories = categoriesToRemove.ToList()

        Dim positive = GrammarMatcher.ConceptsFromCategoryGrammars(payload, ontology)
        result.PositiveConcepts = positive.
            Where(Function(c) c IsNot Nothing AndAlso Not categoriesToRemove.Contains(c.Category.Trim())).
            ToList()

        Return result
    End Function

    Private Function TryMatchNegatedCategory(text As String, category As Models.CategoryDefinition) As Boolean
        Dim tokens = CollectCategoryMatchTokens(category)
        If tokens.Count = 0 Then Return False

        Dim tokenPattern = String.Join("|", tokens.Select(Function(t) Regex.Escape(t)).OrderByDescending(Function(t) t.Length))
        Dim pattern = $"{NegatorPrefix}{OptionalArticle}(?:{tokenPattern})"
        Try
            Return Regex.IsMatch(text, pattern, RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)
        Catch
            Return False
        End Try
    End Function

    Private Function CollectCategoryMatchTokens(category As Models.CategoryDefinition) As List(Of String)
        Dim tokens As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)

        If category.AllowedValues IsNot Nothing Then
            For Each value In category.AllowedValues
                If String.IsNullOrWhiteSpace(value) Then Continue For
                tokens.Add(value.Trim())
                For Each part In ValueSetOps.ParseValueSetKey(value.Trim())
                    If Not String.IsNullOrWhiteSpace(part) Then tokens.Add(part.Trim())
                Next
            Next
        End If

        If category.Grammar IsNot Nothing Then
            CollectTokensFromGrammar(category.Grammar, tokens)
        End If

        Return tokens.
            Where(Function(t) Not String.IsNullOrWhiteSpace(t)).
            OrderByDescending(Function(t) t.Length).
            ToList()
    End Function

    Private Sub CollectTokensFromGrammar(grammar As Models.CategoryGrammar, tokens As HashSet(Of String))
        If grammar Is Nothing Then Return

        If grammar.Mappings IsNot Nothing Then
            For Each mapped In grammar.Mappings.Values
                If Not String.IsNullOrWhiteSpace(mapped) Then tokens.Add(mapped.Trim())
            Next
        End If

        If String.IsNullOrWhiteSpace(grammar.Regex) Then Return

        For Each match As Match In Regex.Matches(grammar.Regex, "[^|()?\:\\<>]+", RegexOptions.IgnoreCase)
            Dim token = match.Value.Trim()
            If token.Length < 2 Then Continue For
            If token.StartsWith("?<", StringComparison.Ordinal) Then Continue For
            tokens.Add(token)
        Next
    End Sub

End Module
