''' <summary>
''' Normalizes Italian age utterances before vincolo resolution (STT apostrophes, truncations, units).
''' </summary>
Imports System.Globalization
Imports System.Text
Imports System.Text.RegularExpressions

Public Module AgeUtteranceNormalize

    Private ReadOnly TruncatedStemMap As Dictionary(Of String, String) = New Dictionary(Of String, String)(StringComparer.OrdinalIgnoreCase) From {
        {"vent", "venti"},
        {"trent", "trenta"},
        {"quarant", "quaranta"},
        {"cinquant", "cinquanta"},
        {"sessant", "sessanta"},
        {"settant", "settenta"},
        {"ottant", "ottanta"},
        {"novant", "novanta"}
    }

    Private ReadOnly AgeUnitPattern As String = "anni|anno|mesi|mese|settimane|settimana|giorni|giorno"

    Public Function ExpandTruncatedAgeStem(stem As String) As String
        If String.IsNullOrWhiteSpace(stem) Then Return stem
        Dim cleaned = stem.Trim().ToLowerInvariant().Replace("'", String.Empty)
        Dim expanded As String = Nothing
        If TruncatedStemMap.TryGetValue(cleaned, expanded) Then Return expanded
        Return stem
    End Function

    Public Function NormalizeAgeUtterance(text As String) As String
        Dim normalized = If(text, String.Empty).Trim().ToLowerInvariant()
        If normalized.Length = 0 Then Return String.Empty

        normalized = normalized.Normalize(NormalizationForm.FormD)
        Dim builder As New StringBuilder()
        For Each ch In normalized
            Dim category = CharUnicodeInfo.GetUnicodeCategory(ch)
            If category <> UnicodeCategory.NonSpacingMark Then builder.Append(ch)
        Next
        normalized = builder.ToString().Normalize(NormalizationForm.FormC)

        normalized = Regex.Replace(normalized, "[\u2018\u2019\u201B`]", "'")
        normalized = Regex.Replace(normalized, "\s+", " ")
        normalized = Regex.Replace(normalized, "[.,!?;:]+$", String.Empty).Trim()

        normalized = Regex.Replace(
            normalized,
            $"\b([\w]+)'?\s*({AgeUnitPattern})\b",
            Function(m) $"{ExpandTruncatedAgeStem(m.Groups(1).Value)} {m.Groups(2).Value}",
            RegexOptions.IgnoreCase)

        Return normalized.Trim()
    End Function

End Module
