''' <summary>
''' Executes vincolo resolution pipeline v1 from bundle (design-time contract).
''' </summary>
Imports System.Globalization
Imports System.Text
Imports System.Text.RegularExpressions

Public Module ResolutionRunner

    Public Function Run(pipeline As Models.ResolutionPipeline, text As String) As Models.ResolvedQuantity
        If pipeline Is Nothing OrElse pipeline.Steps Is Nothing Then Return Nothing
        If Not String.Equals(pipeline.Engine, "pipeline", StringComparison.OrdinalIgnoreCase) Then Return Nothing
        If pipeline.Version <> 1 Then Return Nothing

        Dim normalized = NormalizeAgeUtterance(text)
        If normalized.Length = 0 Then Return Nothing

        For Each resolutionStep In pipeline.Steps
            If resolutionStep Is Nothing OrElse String.IsNullOrWhiteSpace(resolutionStep.Type) Then Continue For

            Select Case resolutionStep.Type.Trim().ToLowerInvariant()
                Case "regex_capture"
                    Dim fromRegex = RunRegexCapture(resolutionStep, normalized)
                    If fromRegex IsNot Nothing Then Return fromRegex
                Case "word_unit_capture"
                    Dim fromWordUnit = RunWordUnitCapture(resolutionStep, normalized)
                    If fromWordUnit IsNot Nothing Then Return fromWordUnit
                Case "word_map"
                    Dim fromWords = RunWordMap(resolutionStep, normalized)
                    If fromWords IsNot Nothing Then Return fromWords
                Case "bare_number"
                    Dim fromBare = RunBareNumber(resolutionStep, normalized)
                    If fromBare IsNot Nothing Then Return fromBare
            End Select
        Next

        Return Nothing
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
        normalized = Regex.Replace(normalized, "\s+", " ")
        normalized = Regex.Replace(normalized, "vent'\s*anni", "venti anni", RegexOptions.IgnoreCase)
        normalized = Regex.Replace(normalized, "vent'anni", "venti anni", RegexOptions.IgnoreCase)
        normalized = Regex.Replace(normalized, "(\w)'(\w)", "$1$2")
        normalized = Regex.Replace(normalized, "\bvent'\b", "venti", RegexOptions.IgnoreCase)
        Return normalized.Trim()
    End Function

    Private Function RunRegexCapture(resolutionStep As Models.ResolutionStep, text As String) As Models.ResolvedQuantity
        If String.IsNullOrWhiteSpace(resolutionStep.Pattern) Then Return Nothing

        Dim match As Match
        Try
            match = Regex.Match(text, resolutionStep.Pattern, RegexOptions.IgnoreCase)
        Catch
            Return Nothing
        End Try
        If Not match.Success Then Return Nothing

        Dim valueGroup = If(resolutionStep.ValueGroup.HasValue, resolutionStep.ValueGroup.Value, 1)
        If valueGroup < 0 OrElse valueGroup >= match.Groups.Count Then Return Nothing

        Dim rawValue = match.Groups(valueGroup).Value
        Dim value As Integer
        If Not Integer.TryParse(rawValue.Trim(), value) Then Return Nothing
        If value < 0 OrElse value > 120 Then Return Nothing

        Dim unitToken = String.Empty
        If resolutionStep.UnitGroup.HasValue AndAlso resolutionStep.UnitGroup.Value > 0 AndAlso resolutionStep.UnitGroup.Value < match.Groups.Count Then
            unitToken = match.Groups(resolutionStep.UnitGroup.Value).Value
        End If
        Dim unit = ResolveUnitToken(unitToken, resolutionStep.UnitMap, resolutionStep.DefaultUnit)

        Return New Models.ResolvedQuantity With {.Value = value, .Unit = unit}
    End Function

    Private Function RunWordUnitCapture(resolutionStep As Models.ResolutionStep, text As String) As Models.ResolvedQuantity
        If String.IsNullOrWhiteSpace(resolutionStep.Pattern) Then Return Nothing
        If resolutionStep.WordValueMap Is Nothing OrElse resolutionStep.WordValueMap.Count = 0 Then Return Nothing

        Dim match As Match
        Try
            match = Regex.Match(text, resolutionStep.Pattern, RegexOptions.IgnoreCase)
        Catch
            Return Nothing
        End Try
        If Not match.Success Then Return Nothing

        Dim wordGroup = If(resolutionStep.WordGroup.HasValue, resolutionStep.WordGroup.Value, 1)
        If wordGroup < 1 OrElse wordGroup >= match.Groups.Count Then Return Nothing

        Dim rawWord = match.Groups(wordGroup).Value.Trim().ToLowerInvariant().Replace("'", "")
        If String.IsNullOrEmpty(rawWord) Then Return Nothing

        Dim value As Integer
        If Not resolutionStep.WordValueMap.TryGetValue(rawWord, value) Then Return Nothing
        If value < 0 OrElse value > 120 Then Return Nothing

        Dim unitToken = String.Empty
        If resolutionStep.UnitGroup.HasValue AndAlso resolutionStep.UnitGroup.Value > 0 AndAlso resolutionStep.UnitGroup.Value < match.Groups.Count Then
            unitToken = match.Groups(resolutionStep.UnitGroup.Value).Value
        End If
        If String.IsNullOrWhiteSpace(unitToken) Then Return Nothing
        Dim unit = ResolveUnitToken(unitToken, resolutionStep.UnitMap, resolutionStep.DefaultUnit)

        Return New Models.ResolvedQuantity With {.Value = value, .Unit = unit}
    End Function

    Private Function RunWordMap(resolutionStep As Models.ResolutionStep, text As String) As Models.ResolvedQuantity
        If resolutionStep.Entries Is Nothing OrElse resolutionStep.Entries.Count = 0 Then Return Nothing

        Dim ambiguous As New HashSet(Of String)(New String() {"un", "uno", "una"}, StringComparer.OrdinalIgnoreCase)

        For Each entry In resolutionStep.Entries.OrderByDescending(Function(e) If(e?.Word, String.Empty).Length)
            If entry Is Nothing OrElse String.IsNullOrWhiteSpace(entry.Word) Then Continue For
            If ambiguous.Contains(entry.Word) Then Continue For
            Dim word = entry.Word.Trim().ToLowerInvariant().Replace("'", "")
            Dim pattern = "\b" & Regex.Escape(word) & "\b"
            If Regex.IsMatch(text, pattern, RegexOptions.IgnoreCase) Then
                Dim unit = If(String.IsNullOrWhiteSpace(entry.Unit), "years", entry.Unit.Trim().ToLowerInvariant())
                Return New Models.ResolvedQuantity With {.Value = entry.Value, .Unit = unit}
            End If
        Next

        Return Nothing
    End Function

    Private Function RunBareNumber(resolutionStep As Models.ResolutionStep, text As String) As Models.ResolvedQuantity
        If String.IsNullOrWhiteSpace(resolutionStep.Pattern) Then Return Nothing

        Try
            If Not Regex.IsMatch(text, resolutionStep.Pattern, RegexOptions.IgnoreCase) Then Return Nothing
        Catch
            Return Nothing
        End Try

        Dim value As Integer
        If Not Integer.TryParse(text.Trim(), value) Then Return Nothing
        If value < 0 OrElse value > 120 Then Return Nothing

        Dim unit = ResolveUnitToken(String.Empty, Nothing, resolutionStep.DefaultUnit)
        Return New Models.ResolvedQuantity With {.Value = value, .Unit = unit}
    End Function

    Private Function ResolveUnitToken(
        unitToken As String,
        unitMap As Dictionary(Of String, String),
        defaultUnit As String
    ) As String
        Dim token = If(unitToken, String.Empty).Trim().ToLowerInvariant()
        If Not String.IsNullOrEmpty(token) AndAlso unitMap IsNot Nothing AndAlso unitMap.ContainsKey(token) Then
            Return AgeUnitConverter.ParseUnitToken(unitMap(token))
        End If
        If Not String.IsNullOrWhiteSpace(defaultUnit) Then
            Return AgeUnitConverter.ParseUnitToken(defaultUnit)
        End If
        Return "years"
    End Function

    Public Function RunForCategory(category As Models.CategoryDefinition, text As String) As Models.ResolvedQuantity
        If category Is Nothing Then Return Nothing
        If category.Resolution IsNot Nothing Then Return Run(category.Resolution, text)
        Return Nothing
    End Function

End Module
