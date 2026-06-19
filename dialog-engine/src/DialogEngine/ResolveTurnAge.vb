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

    Public Function TryParseAgeQuantity(
        value As String,
        Optional unit As String = Nothing
    ) As Models.ResolvedQuantity
        If String.IsNullOrWhiteSpace(value) Then Return Nothing
        If LooksLikeFasciaConstraintToken(value) Then Return Nothing

        Dim trimmed = value.Trim()
        Dim numericValue As Integer
        If Not Integer.TryParse(trimmed, numericValue) Then Return Nothing
        If numericValue < 0 OrElse numericValue > 120 Then Return Nothing

        Dim normalizedUnit = AgeUnitConverter.ParseUnitToken(unit)
        If String.IsNullOrWhiteSpace(normalizedUnit) Then
            normalizedUnit = "years"
        End If
        If AgeUnitConverter.ToTotalMonths(numericValue, normalizedUnit).HasValue Then
            Return New Models.ResolvedQuantity With {
                .Value = numericValue,
                .Unit = normalizedUnit
            }
        End If
        Return Nothing
    End Function

    Public Function NormalizeAgeConceptQuantity(concept As Models.Concept) As Models.ResolvedQuantity
        If concept Is Nothing Then Return Nothing
        If LooksLikeFasciaConstraintToken(concept.Value) Then Return Nothing

        Dim fromUnit = TryParseAgeQuantity(concept.Value, concept.Unit)
        If fromUnit IsNot Nothing Then Return fromUnit

        Dim legacyYears = ConstraintValidation.ExtractAgeYearsFromText(concept.Value)
        If legacyYears.HasValue Then
            Return New Models.ResolvedQuantity With {
                .Value = legacyYears.Value,
                .Unit = "years"
            }
        End If

        Return Nothing
    End Function

    Public Function ParseAgeTotalMonthsFromConcept(concept As Models.Concept) As Integer?
        Dim quantity = NormalizeAgeConceptQuantity(concept)
        If quantity Is Nothing Then Return Nothing
        Return AgeUnitConverter.ToTotalMonths(quantity.Value, quantity.Unit)
    End Function

    Public Function HasResolvedAgeQuantity(concept As Models.Concept) As Boolean
        Return ParseAgeTotalMonthsFromConcept(concept).HasValue
    End Function

    Public Function ParseAgeYearsFromSlotValue(value As String, Optional unit As String = Nothing) As Integer?
        Dim quantity = TryParseAgeQuantity(value, unit)
        If quantity Is Nothing Then
            Return ConstraintValidation.ExtractAgeYearsFromText(value)
        End If
        Return AgeUnitConverter.ToYears(quantity.Value, quantity.Unit)
    End Function

    Public Function ParseAgeYearsFromConcept(concept As Models.Concept) As Integer?
        If concept Is Nothing Then Return Nothing
        Return ParseAgeYearsFromSlotValue(concept.Value, concept.Unit)
    End Function

End Module
