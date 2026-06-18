''' <summary>
''' Turn-scoped answer grammars for disambiguation states (sì/no, option pick → canonical token).
''' </summary>
Imports System.Text.RegularExpressions

Public Module DisambiguationAnswer

    Private ReadOnly AffirmativeSynonyms As String() = {
        "sì", "si", "yes", "ok", "certo", "va bene", "d'accordo", "daccordo", "confermo"
    }

    Private ReadOnly DeclineSynonyms As String() = {
        "no", "niente", "neanche", "non serve", "senza", "niente grazie", "no grazie",
        "nessuno", "nessuna", "nessun esame", "senza esame"
    }

    Public Function ExtractConceptFromUtterance(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String),
        utterance As String
    ) As Models.Concept
        Dim resolvedOptions = ResolveOptionsList(options)
        If String.IsNullOrWhiteSpace(categoryName) OrElse resolvedOptions.Count = 0 Then
            Return Nothing
        End If

        Dim text = If(utterance, String.Empty).Trim().ToLowerInvariant()
        If text.Length = 0 Then Return Nothing

        Dim grammar = ResolveAnswerGrammar(bundle, categoryName, resolvedOptions)
        Dim canonical = MatchAnswerGrammar(text, grammar)
        If String.IsNullOrWhiteSpace(canonical) Then Return Nothing
        If Not resolvedOptions.Any(Function(o) String.Equals(o?.Trim(), canonical, StringComparison.OrdinalIgnoreCase)) Then
            Return Nothing
        End If

        Dim matchedToken = resolvedOptions.First(
            Function(o) String.Equals(o?.Trim(), canonical, StringComparison.OrdinalIgnoreCase)).Trim()

        Return New Models.Concept With {
            .Category = categoryName.Trim(),
            .Value = matchedToken,
            .Kind = Models.ConceptKind.Attributo
        }
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
            bundle, priorCandidates, If(conversation?.AcquiredConcepts, New List(Of Models.Concept)()))
        If target Is Nothing Then Return New List(Of String)()
        If Not String.Equals(target.CategoryName, pendingCategoryName.Trim(), StringComparison.Ordinal) Then
            Return New List(Of String)()
        End If
        Return target.Options
    End Function

    Public Function ResolveAnswerGrammar(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String)
    ) As Models.CategoryGrammar
        Dim resolvedOptions = ResolveOptionsList(options)
        Dim fromPlan = FindPlanAnswerGrammar(bundle, categoryName, resolvedOptions)
        If fromPlan IsNot Nothing Then Return fromPlan
        Return CompileFallbackGrammar(resolvedOptions)
    End Function

    Private Function ResolveOptionsList(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
            Select(Function(o) o.Trim()).
            ToList()
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

    Private Function MatchAnswerGrammar(text As String, grammar As Models.CategoryGrammar) As String
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return Nothing

        Try
            Dim match = Regex.Match(text, grammar.Regex, RegexOptions.IgnoreCase)
            If Not match.Success Then Return Nothing

            If grammar.Mappings IsNot Nothing Then
                For Each groupName In grammar.Mappings.Keys
                    Dim group = match.Groups(groupName)
                    If group.Success AndAlso Not String.IsNullOrEmpty(group.Value) Then
                        Return grammar.Mappings(groupName)
                    End If
                Next
            End If

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

    Private Function CompileFallbackGrammar(options As IList(Of String)) As Models.CategoryGrammar
        Dim cleaned = ResolveOptionsList(options)
        If cleaned.Count = 0 Then Return Nothing

        Dim parts As New List(Of String)()
        Dim mappings As New Dictionary(Of String, String)(StringComparer.Ordinal)

        Dim visible = cleaned.Where(Function(o) Not CategoryTypes.IsMissingCategoryValue(o)).ToList()
        Dim hasNone = cleaned.Any(AddressOf CategoryTypes.IsMissingCategoryValue)

        If hasNone AndAlso visible.Count = 1 Then
            Dim token = visible(0)
            parts.Add($"(?<affirmative>{String.Join("|", AffirmativeSynonyms.Select(AddressOf Regex.Escape))})")
            mappings("affirmative") = token
            parts.Add($"(?<decline>{String.Join("|", DeclineSynonyms.Select(AddressOf Regex.Escape))})")
            mappings("decline") = CategoryTypes.MissingCategoryValue
            parts.Add($"(?<literal>{Regex.Escape(token)})")
            mappings("literal") = token
        Else
            Dim index = 0
            For Each optionValue In cleaned
                If CategoryTypes.IsMissingCategoryValue(optionValue) Then Continue For
                Dim groupName = $"opt_{index}"
                index += 1
                parts.Add($"(?<{groupName}>{Regex.Escape(optionValue)})")
                mappings(groupName) = optionValue
            Next
            If hasNone Then
                parts.Add($"(?<decline>{String.Join("|", DeclineSynonyms.Select(AddressOf Regex.Escape))})")
                mappings("decline") = CategoryTypes.MissingCategoryValue
            End If
        End If

        If parts.Count = 0 Then Return Nothing
        Return New Models.CategoryGrammar With {
            .Regex = String.Join("|", parts),
            .Mappings = mappings
        }
    End Function

End Module
