''' <summary>
''' Turn-scoped answer grammars for disambiguation states (sì/no, option pick → canonical value set key).
''' </summary>
Imports System.Text.RegularExpressions

Public Module DisambiguationAnswer

    Public Function ExtractConceptFromUtterance(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String),
        utterance As String,
        Optional planSignature As String = Nothing
    ) As Models.Concept
        Dim resolvedOptions = ResolveOptionsList(options)
        If String.IsNullOrWhiteSpace(categoryName) OrElse resolvedOptions.Count = 0 Then
            Return Nothing
        End If

        Dim text = If(utterance, String.Empty).Trim().ToLowerInvariant()
        If text.Length = 0 Then Return Nothing

        Dim tokenMatch = DisambiguationTokenMatch.MatchOptionKeyByTokenCoverage(text, resolvedOptions)
        Dim grammar = ResolveAnswerGrammar(bundle, categoryName, resolvedOptions, planSignature)
        Dim canonical As String = Nothing
        If Not String.IsNullOrWhiteSpace(tokenMatch) Then
            canonical = tokenMatch
        ElseIf grammar IsNot Nothing Then
            canonical = MatchAnswerGrammar(text, grammar)
        End If
        If String.IsNullOrWhiteSpace(canonical) Then Return Nothing

        canonical = CoerceCanonicalToAllowedOption(canonical, resolvedOptions)
        If String.IsNullOrWhiteSpace(canonical) Then Return Nothing

        Dim matchedKey = resolvedOptions.First(
            Function(o) String.Equals(o?.Trim(), canonical, StringComparison.OrdinalIgnoreCase)).Trim()

        If CategoryTypes.IsMissingCategoryValue(matchedKey) Then
            Return ValueSetOps.CreateAttributoConcept(
                categoryName.Trim(),
                New List(Of String) From {CategoryTypes.MissingCategoryValue})
        End If

        Return ValueSetOps.CreateAttributoConcept(
            categoryName.Trim(),
            ValueSetOps.ParseValueSetKey(matchedKey))
    End Function

    ''' <summary>Rebuilds option tokens when session AllowedTokens was not round-tripped.</summary>
    Public Function ResolveOptionsForPending(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        pendingCategoryName As String
    ) As List(Of String)
        If bundle Is Nothing OrElse String.IsNullOrWhiteSpace(pendingCategoryName) Then
            Return New List(Of String)()
        End If

        Dim pending = conversation?.PendingConstraint
        If pending?.AllowedTokens IsNot Nothing AndAlso pending.AllowedTokens.Count > 0 Then
            Return pending.AllowedTokens.
                Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
                Select(Function(o) o.Trim()).
                ToList()
        End If

        Dim priorCandidates = AgentSlotMatch.PriorCandidates(bundle, conversation)
        Dim target = AgentSlotMatch.FindDisambiguationTarget(
            bundle, priorCandidates, If(conversation?.AcquiredConcepts, New List(Of Models.Concept)()),
            If(conversation?.ExactAttributoCategories, New List(Of String)()))
        If target Is Nothing Then Return New List(Of String)()
        If Not String.Equals(target.CategoryName, pendingCategoryName.Trim(), StringComparison.Ordinal) Then
            Return New List(Of String)()
        End If
        Return target.Options
    End Function

    ''' <summary>Plan answer grammar only — signature first, then category+options key. No runtime synthesis.</summary>
    Public Function ResolveAnswerGrammar(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String),
        Optional planSignature As String = Nothing
    ) As Models.CategoryGrammar
        If Not String.IsNullOrWhiteSpace(planSignature) Then
            Dim bySignature = FindPlanAnswerGrammarBySignature(bundle, planSignature)
            If bySignature IsNot Nothing Then Return bySignature
        End If
        Return FindPlanAnswerGrammar(bundle, categoryName, options)
    End Function

    Private Function ResolveOptionsList(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
            Select(Function(o) o.Trim()).
            ToList()
    End Function

    Private Function FindPlanAnswerGrammarBySignature(
        bundle As Models.AgentBundle,
        signature As String
    ) As Models.CategoryGrammar
        Dim record = DisambiguationCopy.FindMessageRecordBySignature(bundle, signature)
        If record?.AnswerGrammar Is Nothing OrElse String.IsNullOrWhiteSpace(record.AnswerGrammar.Regex) Then
            Return Nothing
        End If
        Return record.AnswerGrammar
    End Function

    Private Function FindPlanAnswerGrammar(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String)
    ) As Models.CategoryGrammar
        Dim record = DisambiguationCopy.FindMessageRecord(bundle, categoryName, options)
        If record?.AnswerGrammar Is Nothing OrElse String.IsNullOrWhiteSpace(record.AnswerGrammar.Regex) Then
            Return Nothing
        End If
        Return record.AnswerGrammar
    End Function

    ''' <summary>
    ''' Maps grammar aliases (e.g. plan copy tokens) to the sole catalog option when optional_include.
    ''' </summary>
    Private Function CoerceCanonicalToAllowedOption(
        canonical As String,
        resolvedOptions As IList(Of String)
    ) As String
        If String.IsNullOrWhiteSpace(canonical) Then Return Nothing
        Dim trimmed = canonical.Trim()
        If resolvedOptions.Any(Function(o) String.Equals(o?.Trim(), trimmed, StringComparison.OrdinalIgnoreCase)) Then
            Return trimmed
        End If

        Dim visible = resolvedOptions.
            Where(Function(o) Not CategoryTypes.IsMissingCategoryValue(o)).
            Select(Function(o) o.Trim()).
            ToList()

        If visible.Count = 1 AndAlso Not CategoryTypes.IsMissingCategoryValue(trimmed) Then
            Return visible(0)
        End If

        Return Nothing
    End Function

    Private Function MatchAnswerGrammar(text As String, grammar As Models.CategoryGrammar) As String
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return Nothing

        Try
            Dim match = Regex.Match(text, grammar.Regex, RegexOptions.IgnoreCase)
            If Not match.Success Then Return Nothing

            Dim bestCanonical As String = Nothing
            Dim bestLength = -1

            If grammar.Mappings IsNot Nothing Then
                For Each groupName In grammar.Mappings.Keys
                    Dim group = match.Groups(groupName)
                    If group.Success AndAlso Not String.IsNullOrEmpty(group.Value) Then
                        Dim mapped = grammar.Mappings(groupName)
                        If group.Value.Length > bestLength Then
                            bestLength = group.Value.Length
                            bestCanonical = mapped
                        End If
                    End If
                Next
            End If

            If Not String.IsNullOrWhiteSpace(bestCanonical) Then Return bestCanonical

            For Each group As Group In match.Groups
                If group.Name = "0" Then Continue For
                If group.Success AndAlso Not String.IsNullOrEmpty(group.Value) Then
                    Return group.Value
                End If
            Next
        Catch
            Return Nothing
        End Try

        Return Nothing
    End Function

End Module
