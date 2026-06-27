''' <summary>
''' Combinatorial disambiguation answer grammars: independent atomic matching,
''' value-set key resolution delegated to DisambiguationTokenMatch.
''' </summary>
Imports System.Text.RegularExpressions

Public Module CombinatorialAnswerGrammar

    Public Function IsCombinatorialGrammar(grammar As Models.CategoryGrammar) As Boolean
        Return grammar IsNot Nothing AndAlso If(grammar.Combinatorial, False)
    End Function

    ''' <summary>Returns every atomic mapping value independently matched in the utterance.</summary>
    Public Function MatchAllAtoms(text As String, grammar As Models.CategoryGrammar) As List(Of String)
        Dim mentioned As New List(Of String)()
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return mentioned
        If grammar.Mappings Is Nothing OrElse grammar.Mappings.Count = 0 Then Return mentioned

        Dim trimmed = If(text, String.Empty).Trim().ToLowerInvariant()
        If trimmed.Length = 0 Then Return mentioned

        For Each groupName In grammar.Mappings.Keys
            Dim atom = grammar.Mappings(groupName)
            If String.IsNullOrWhiteSpace(atom) Then Continue For

            Dim pattern = ExtractNamedGroupPattern(grammar.Regex, groupName)
            If String.IsNullOrWhiteSpace(pattern) Then Continue For

            Try
                Dim re As New Regex(
                    $"(?<!\w)(?:{pattern})(?!\w)",
                    RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)
                If Not re.IsMatch(trimmed) Then Continue For
                If Not mentioned.Any(Function(m) String.Equals(m, atom, StringComparison.OrdinalIgnoreCase)) Then
                    mentioned.Add(atom.Trim())
                End If
            Catch
                Continue For
            End Try
        Next

        Return ValueSetOps.NormalizeAttributoValues(mentioned)
    End Function

    ''' <summary>Matches atoms via grammar and resolves the catalog option key.</summary>
    Public Function MatchAndResolveOptionKey(
        text As String,
        grammar As Models.CategoryGrammar,
        options As IList(Of String)
    ) As String
        Dim mentioned = MatchAllAtoms(text, grammar)
        If mentioned.Count = 0 Then Return Nothing
        Return DisambiguationTokenMatch.ResolveOptionKeyFromMentionedAtoms(mentioned, options)
    End Function

    Friend Function ExtractNamedGroupPattern(regex As String, groupName As String) As String
        If String.IsNullOrWhiteSpace(regex) OrElse String.IsNullOrWhiteSpace(groupName) Then Return Nothing

        Dim marker = "(?<" & groupName & ">"
        Dim idx = regex.IndexOf(marker, StringComparison.Ordinal)
        If idx < 0 Then Return Nothing

        Dim depth = 1
        Dim i = idx + marker.Length
        Dim start = i
        While i < regex.Length AndAlso depth > 0
            Dim ch = regex(i)
            If ch = "("c AndAlso (i = 0 OrElse regex(i - 1) <> "\"c) Then
                depth += 1
            ElseIf ch = ")"c AndAlso (i = 0 OrElse regex(i - 1) <> "\"c) Then
                depth -= 1
            End If
            i += 1
        End While

        If depth <> 0 Then Return Nothing
        Return regex.Substring(start, i - start - 1)
    End Function

End Module
