''' <summary>
''' Runtime validators for compile-time age constraints and Italian age extraction.
''' </summary>
Imports System.Text.RegularExpressions

Public Module ConstraintValidation

    Public Const AgeYearsQuestion As String = "Quanti anni ha il paziente?"

    Private ReadOnly ItalianAgeWords As Dictionary(Of String, Integer) = New Dictionary(Of String, Integer)(StringComparer.OrdinalIgnoreCase) From {
        {"zero", 0}, {"uno", 1}, {"una", 1}, {"due", 2}, {"tre", 3}, {"quattro", 4},
        {"cinque", 5}, {"sei", 6}, {"sette", 7}, {"otto", 8}, {"nove", 9}, {"dieci", 10},
        {"undici", 11}, {"dodici", 12}, {"tredici", 13}, {"quattordici", 14}, {"quindici", 15},
        {"sedici", 16}, {"diciassette", 17}, {"diciotto", 18}, {"diciannove", 19},
        {"venti", 20}, {"trenta", 30}, {"trent", 30}, {"quaranta", 40}, {"cinquanta", 50},
        {"sessanta", 60}, {"settanta", 70}, {"ottanta", 80}, {"novanta", 90}, {"cento", 100}
    }

    Public Function SatisfiesAgeYears(age As Integer, min As Integer?, max As Integer?) As Boolean
        If age < 0 Then Return False
        If min.HasValue AndAlso age < min.Value Then Return False
        If max.HasValue AndAlso age > max.Value Then Return False
        Return True
    End Function

    Public Function PathSatisfiesAgeConstraints(age As Integer, constraints As IList(Of Models.AgeConstraint)) As Boolean
        If constraints Is Nothing OrElse constraints.Count = 0 Then Return True
        Return constraints.All(Function(rule) SatisfiesAgeYears(age, rule.Min, rule.Max))
    End Function

    Public Function SatisfiesAgeTotalMonths(totalMonths As Integer, min As Integer?, max As Integer?) As Boolean
        If totalMonths < 0 Then Return False
        If min.HasValue AndAlso totalMonths < min.Value * 12 Then Return False
        If max.HasValue AndAlso totalMonths > (max.Value * 12) + 11 Then Return False
        Return True
    End Function

    Public Function SatisfiesAgeConstraintTotalWeeks(
        totalWeeks As Integer,
        rule As Models.AgeConstraint
    ) As Boolean
        If totalWeeks < 0 Then Return False
        If rule.MinWeeks.HasValue OrElse rule.MaxWeeks.HasValue Then
            If rule.MinWeeks.HasValue AndAlso totalWeeks < rule.MinWeeks.Value Then Return False
            If rule.MaxWeeks.HasValue AndAlso totalWeeks > rule.MaxWeeks.Value Then Return False
            Return True
        End If
        Dim totalMonths = (totalWeeks * 12 + 26) \ 52
        Return SatisfiesAgeConstraintTotalMonths(totalMonths, rule)
    End Function

    Public Function PathSatisfiesAgeConstraintsFromTotalWeeks(
        totalWeeks As Integer,
        constraints As IList(Of Models.AgeConstraint)
    ) As Boolean
        If constraints Is Nothing OrElse constraints.Count = 0 Then Return True
        Return constraints.All(Function(rule) SatisfiesAgeConstraintTotalWeeks(totalWeeks, rule))
    End Function

    Public Function SatisfiesAgeConstraintTotalMonths(
        totalMonths As Integer,
        rule As Models.AgeConstraint
    ) As Boolean
        If totalMonths < 0 Then Return False
        If rule.MinMonths.HasValue OrElse rule.MaxMonths.HasValue Then
            If rule.MinMonths.HasValue AndAlso totalMonths < rule.MinMonths.Value Then Return False
            If rule.MaxMonths.HasValue AndAlso totalMonths > rule.MaxMonths.Value Then Return False
            Return True
        End If
        Return SatisfiesAgeTotalMonths(totalMonths, rule.Min, rule.Max)
    End Function

    Public Function PathSatisfiesAgeConstraintsFromTotalMonths(
        totalMonths As Integer,
        constraints As IList(Of Models.AgeConstraint)
    ) As Boolean
        If constraints Is Nothing OrElse constraints.Count = 0 Then Return True
        Return constraints.All(Function(rule) SatisfiesAgeConstraintTotalMonths(totalMonths, rule))
    End Function

    Public Function ExtractAgeYearsFromText(text As String) As Integer?
        If String.IsNullOrWhiteSpace(text) Then Return Nothing
        Dim normalized = AgeUtteranceNormalize.NormalizeAgeUtterance(text)
        If String.IsNullOrWhiteSpace(normalized) Then Return Nothing

        Dim explicitMatch = Regex.Match(normalized, "(?:ho|ha|sono|è|e|di)\s*(\d{1,3})\s*anni?")
        If explicitMatch.Success Then
            Return Integer.Parse(explicitMatch.Groups(1).Value)
        End If

        Dim bareMatch = Regex.Match(normalized, "\b(\d{1,3})\s*anni?\b")
        If bareMatch.Success Then
            Return Integer.Parse(bareMatch.Groups(1).Value)
        End If

        Dim wordWithVerb = Regex.Match(normalized, "(?:ho|ha|sono|è|e|di)\s+([a-zàèéìòù']+)(?:\s+anni|\s*'anni)")
        If wordWithVerb.Success Then
            Dim age = ParseItalianAgeWord(wordWithVerb.Groups(1).Value)
            If age.HasValue Then Return age
        End If

        Dim wordWithAnni = Regex.Match(normalized, "^([a-zàèéìòù']+)(?:\s+anni|\s*'anni)$")
        If wordWithAnni.Success Then
            Dim age = ParseItalianAgeWord(wordWithAnni.Groups(1).Value)
            If age.HasValue Then Return age
        End If

        If Regex.IsMatch(normalized, "^\d{1,3}$") Then
            Dim bareAge = Integer.Parse(normalized)
            If bareAge >= 0 AndAlso bareAge <= 120 Then Return bareAge
        End If

        Return ParseItalianAgeWord(normalized)
    End Function

    Private Function ParseItalianAgeWord(raw As String) As Integer?
        Dim key = CategoryNormalization.NormalizeWordKey(raw)
        If ItalianAgeWords.TryGetValue(key, Nothing) Then
            Dim age = ItalianAgeWords(key)
            If age >= 0 AndAlso age <= 120 Then Return age
        End If
        Return Nothing
    End Function

End Module
