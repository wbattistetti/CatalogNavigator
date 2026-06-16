''' <summary>
''' Resolves patient age from voice-agent concepts; filters invalid fascia tokens.
''' </summary>
Imports System.Text.RegularExpressions

Public Module ResolveTurnAge

    Public Function LooksLikeFasciaConstraintToken(value As String) As Boolean
        If String.IsNullOrWhiteSpace(value) Then Return False
        Dim normalized = value.Trim().ToLowerInvariant()
        If Regex.IsMatch(normalized, "^\d{1,3}$") Then Return False
        If Regex.IsMatch(normalized, "[<>≥≤]") Then Return True
        If Regex.IsMatch(normalized, "\b(over|under|oltre|sotto|fino|da|meno\s+di|più\s+di)\b") Then Return True
        If Regex.IsMatch(normalized, "\bda\s+\d+\s+anni?\s+a\s+\d+") Then Return True
        If Regex.IsMatch(normalized, "\d+\s*-\s*\d+") Then Return True
        Return False
    End Function

    Public Function ParseAgeYearsFromSlotValue(value As String, Optional unit As String = Nothing) As Integer?
        If String.IsNullOrWhiteSpace(value) Then Return Nothing
        Dim trimmed = value.Trim()
        If LooksLikeFasciaConstraintToken(trimmed) Then Return Nothing

        If Not String.IsNullOrWhiteSpace(unit) Then
            Dim numericValue As Integer
            If Integer.TryParse(trimmed, numericValue) Then
                Return AgeUnitConverter.ToYears(numericValue, unit)
            End If
        End If

        If Regex.IsMatch(trimmed, "^\d{1,3}$") Then
            Dim age = Integer.Parse(trimmed)
            If age >= 0 Then Return age
        End If

        Return ConstraintValidation.ExtractAgeYearsFromText(trimmed)
    End Function

    Public Function ParseAgeYearsFromConcept(concept As Models.Concept) As Integer?
        If concept Is Nothing Then Return Nothing
        Return ParseAgeYearsFromSlotValue(concept.Value, concept.Unit)
    End Function

End Module
