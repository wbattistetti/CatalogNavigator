''' <summary>
''' Maps natural-language disambiguation answers to exact allowed value-set keys via token coverage.
''' </summary>
Imports System.Globalization
Imports System.Text.RegularExpressions

Public Module DisambiguationTokenMatch

    Private ReadOnly PreferMaximalPhrases As String() = {
        "più completa", "piu completa", "più completo", "piu completo",
        "la più completa", "la piu completa", "il più completo", "il piu completo",
        "quello più completo", "quella più completa", "versione più completa",
        "versione piu completa", "più ricca", "piu ricca"
    }

    ''' <summary>
    ''' Returns an allowed option key when utterance tokens identify exactly one allowed set,
    ''' or when a maximal-set phrase selects the largest matching allowed option.
    ''' </summary>
    Public Function MatchOptionKeyByTokenCoverage(
        utterance As String,
        options As IList(Of String)
    ) As String
        Dim cleaned = ResolveOptionsList(options)
        If cleaned.Count = 0 Then Return Nothing

        Dim text = If(utterance, String.Empty).Trim().ToLowerInvariant()
        If text.Length = 0 Then Return Nothing

        Dim atoms = CollectAtomicTokens(cleaned)
        If atoms.Count = 0 Then Return Nothing

        Dim preferMaximal = PrefersMaximalOption(text)
        Dim mentioned = ExtractMentionedTokens(text, atoms)

        If mentioned.Count > 0 Then
            Dim exact = FindExactOptionKey(mentioned, cleaned)
            If Not String.IsNullOrWhiteSpace(exact) Then Return exact
        End If

        If preferMaximal OrElse mentioned.Count > 0 Then
            Return FindMaximalMatchingOptionKey(mentioned, cleaned)
        End If

        Return Nothing
    End Function

    Private Function ResolveOptionsList(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
            Select(Function(o) o.Trim()).
            ToList()
    End Function

    Private Function CollectAtomicTokens(options As IList(Of String)) As List(Of String)
        Dim seen As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim atoms As New List(Of String)()

        For Each optionKey In options
            If CategoryTypes.IsMissingCategoryValue(optionKey) Then Continue For
            For Each token In ValueSetOps.ParseValueSetKey(optionKey)
                If seen.Contains(token) Then Continue For
                seen.Add(token)
                atoms.Add(token)
            Next
        Next

        Return atoms.
            OrderByDescending(Function(t) t.Length).
            ThenBy(Function(t) t, StringComparer.Create(New CultureInfo("it-IT"), False)).
            ToList()
    End Function

    Private Function PrefersMaximalOption(text As String) As Boolean
        For Each phrase In PreferMaximalPhrases
            If text.Contains(phrase) Then Return True
        Next
        Return False
    End Function

    Private Function ExtractMentionedTokens(
        text As String,
        atoms As IList(Of String)
    ) As List(Of String)
        Dim mentioned As New List(Of String)()
        Dim usedSpans As New List(Of Tuple(Of Integer, Integer))()

        For Each atom In atoms
            Dim pattern = $"(?<!\w){Regex.Escape(atom)}(?!\w)"
            Dim match = Regex.Match(text, pattern, RegexOptions.IgnoreCase)
            If Not match.Success Then Continue For

            Dim start = match.Index
            Dim length = match.Length
            If SpanOverlapsUsed(start, length, usedSpans) Then Continue For

            mentioned.Add(atom)
            usedSpans.Add(Tuple.Create(start, length))
        Next

        Return ValueSetOps.NormalizeAttributoValues(mentioned)
    End Function

    Private Function SpanOverlapsUsed(
        start As Integer,
        length As Integer,
        usedSpans As IList(Of Tuple(Of Integer, Integer))
    ) As Boolean
        Dim endPos = start + length
        For Each span In usedSpans
            If start < span.Item2 AndAlso endPos > span.Item1 Then Return True
        Next
        Return False
    End Function

    Private Function FindExactOptionKey(
        mentioned As IList(Of String),
        options As IList(Of String)
    ) As String
        Dim mentionedKey = ValueSetOps.ValueSetKey(mentioned)
        Dim matches = options.
            Where(Function(o) String.Equals(o, mentionedKey, StringComparison.OrdinalIgnoreCase)).
            ToList()

        If matches.Count = 1 Then Return matches(0)
        Return Nothing
    End Function

    Private Function FindMaximalMatchingOptionKey(
        mentioned As IList(Of String),
        options As IList(Of String)
    ) As String
        Dim bestKey As String = Nothing
        Dim bestCount = -1

        For Each optionKey In options
            If CategoryTypes.IsMissingCategoryValue(optionKey) Then Continue For
            Dim optionValues = ValueSetOps.ParseValueSetKey(optionKey)
            If mentioned.Count > 0 AndAlso Not ValueSetOps.ValueSetContainsAll(optionValues, mentioned) Then
                Continue For
            End If

            If optionValues.Count > bestCount Then
                bestCount = optionValues.Count
                bestKey = optionKey
            End If
        Next

        Return bestKey
    End Function

End Module
