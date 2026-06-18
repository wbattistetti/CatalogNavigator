''' <summary>
''' Canonical concept value normalization at ingress (compile/runtime boundaries).
''' </summary>
Imports System.Globalization
Imports System.Text

Public Module CategoryNormalization

    ''' <summary>Normalizes free text to the dictionary token shape (trim + lowercase).</summary>
    Public Function CanonicalConceptValue(value As String) As String
        If value Is Nothing Then Return String.Empty
        Return value.Trim().ToLowerInvariant()
    End Function

    ''' <summary>Maps a value to ontology allowedValues text when it matches a catalog token.</summary>
    Public Function ResolveCatalogValue(
        value As String,
        Optional category As Models.CategoryDefinition = Nothing
    ) As String
        If String.IsNullOrWhiteSpace(value) Then Return String.Empty
        If category Is Nothing OrElse category.AllowedValues Is Nothing OrElse category.AllowedValues.Count = 0 Then
            Return value.Trim()
        End If

        Dim normalized = CanonicalConceptValue(value)
        For Each allowed In category.AllowedValues
            If allowed IsNot Nothing AndAlso CanonicalConceptValue(allowed) = normalized Then
                Return allowed
            End If
        Next

        Return value.Trim()
    End Function

    ''' <summary>Canonicalizes one concept value using its category definition when available.</summary>
    Public Function CanonicalizeConceptValue(
        value As String,
        kind As Models.ConceptKind,
        Optional category As Models.CategoryDefinition = Nothing
    ) As String
        If String.IsNullOrWhiteSpace(value) Then Return String.Empty
        If kind = Models.ConceptKind.Vincolo Then Return value.Trim()
        Return ResolveCatalogValue(value, category)
    End Function

    Public Function NormalizeWordKey(text As String) As String
        If String.IsNullOrWhiteSpace(text) Then Return String.Empty
        Return RemoveDiacritics(text.Trim().ToLowerInvariant().Replace("'", ""))
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

End Module
