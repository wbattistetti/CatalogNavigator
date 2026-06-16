''' <summary>
''' Category name and concept value normalization for matching.
''' </summary>
Imports System.Globalization
Imports System.Text

Public Module CategoryNormalization

    Public Function NormalizeCategoryKey(name As String) As String
        If String.IsNullOrWhiteSpace(name) Then Return String.Empty
        Dim stripped = System.Text.RegularExpressions.Regex.Replace(name, "\s*\(VINCOLO\)\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
        Dim lower = stripped.Trim().ToLowerInvariant()
        Return RemoveDiacritics(lower)
    End Function

    Public Function NormalizeConceptValue(value As String) As String
        If value Is Nothing Then Return String.Empty
        Return value.Trim().ToLowerInvariant()
    End Function

    Private Function RemoveDiacritics(text As String) As String
        Dim normalized = text.Normalize(NormalizationForm.FormD)
        Dim builder As New StringBuilder()
        For Each ch In normalized
            Dim category = CharUnicodeInfo.GetUnicodeCategory(ch)
            If category <> UnicodeCategory.NonSpacingMark Then
                builder.Append(ch)
            End If
        Next
        Return builder.ToString().Normalize(NormalizationForm.FormC)
    End Function

    Public Function IsAgeCategoryKey(key As String) As Boolean
        Dim n = NormalizeCategoryKey(key)
        Return n.Contains("fascia") AndAlso n.Contains("eta")
    End Function

    Public Function NormalizeCategoryOrders(categories As IList(Of Models.CategoryDefinition)) As List(Of Models.CategoryDefinition)
        Return categories.
            OrderBy(Function(c) c.Order).
            Select(Function(c, index)
                       c.Order = index
                       Return c
                   End Function).
            ToList()
    End Function

End Module
