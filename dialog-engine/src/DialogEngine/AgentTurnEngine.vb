''' <summary>
''' Agent turn: extract concepts, merge conversation, filter catalog, next step.
''' </summary>
Public Module AgentTurnEngine

    Public Function InitAgentSession() As Models.AgentSessionState
        Return New Models.AgentSessionState With {
            .AcquiredConcepts = New List(Of Models.Concept)(),
            .SelectedPath = Nothing,
            .NoMatchCount = 0,
            .PendingConstraint = Nothing
        }
    End Function

    Public Function ProcessAgentTurn(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput
    ) As Models.AgentTurnResult
        Return FinishTurn(ProcessTurn(bundle, conversation, turn))
    End Function

    Public Function ProcessAgentTurnFromText(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        userText As String
    ) As Models.AgentTurnResult
        Dim turn = New Models.AgentTurnInput With {.Transcript = If(userText, String.Empty).Trim()}
        Return FinishTurn(ProcessTurn(bundle, conversation, turn))
    End Function

    Public Function FormatAgentParsedBlock(
        parsed As IList(Of Models.Concept),
        instruction As Models.AgentTurnInstruction
    ) As String
        Dim lines = parsed.Select(Function(p) $"{p.Category}: {p.Value}").ToList()
        lines.Add($"PROSSIMA_AZIONE: {instruction.Action}")
        Return $"---PARSED---{Environment.NewLine}{String.Join(Environment.NewLine, lines)}"
    End Function

    Private Function ProcessTurn(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput
    ) As Models.AgentTurnResult
        Dim conceptsInUtterance = ExtractConceptsThisTurn(bundle, conversation, turn)
        Dim utterance = If(turn IsNot Nothing AndAlso turn.Transcript IsNot Nothing, turn.Transcript.Trim(), String.Empty)

        If conversation IsNot Nothing AndAlso Not String.IsNullOrEmpty(conversation.SelectedPath) Then
            Return TurnResultBuilder.AlreadyDone(conversation, conceptsInUtterance)
        End If

        Dim priorConversation = conversation
        conversation = MergeIntoConversation(conversation, conceptsInUtterance, utterance)

        Dim candidates = CatalogFilter.FilterCandidates(bundle.Catalog, conversation)
        Dim candidatePaths = candidates.Select(Function(item) item.Path).ToList()
        Dim confirmImplicit = turn IsNot Nothing AndAlso turn.ConfirmImplicitConcepts

        Return NextStep(bundle, priorConversation, conversation, conceptsInUtterance, candidatePaths, confirmImplicit)
    End Function

    Private Function ExtractConceptsThisTurn(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput
    ) As List(Of Models.Concept)
        Dim utterance = utteranceFromTurn(turn)
        Dim incoming = If(turn IsNot Nothing AndAlso turn.IncomingConcepts IsNot Nothing, turn.IncomingConcepts, New List(Of Models.Concept)())
        Dim pendingOnly = IsCollectingConstraintValue(conversation)
        Dim pendingAgeCategory = If(pendingOnly, PendingAgeCategoryName(conversation), Nothing)

        Dim fromUtterance As New List(Of Models.Concept)()
        If Not String.IsNullOrWhiteSpace(utterance) Then
            fromUtterance = ConceptExtraction.ExtractConceptsFromUtterance(
                utterance, bundle.Ontology, pendingAgeCategory, pendingOnly)
        End If
        Dim normalizedUtterance = ConceptExtraction.NormalizeExtractedConcepts(fromUtterance)

        If incoming.Count = 0 Then Return normalizedUtterance

        Dim priorPaths = AgentSlotMatch.PriorCandidatePaths(bundle, conversation)
        Dim validationPaths = If(priorPaths.Count > 0, priorPaths, BundleAccess.ItemPaths(bundle))
        Dim filtered = IncomingConcepts.FilterIncomingConcepts(
            bundle, incoming, If(conversation IsNot Nothing, conversation.PendingConstraint, Nothing), validationPaths)
        Dim normalizedIncoming = ConceptExtraction.NormalizeExtractedConcepts(filtered)

        Return ConceptOps.MergeAcquired(normalizedUtterance, normalizedIncoming)
    End Function

    Private Function utteranceFromTurn(turn As Models.AgentTurnInput) As String
        If turn Is Nothing OrElse turn.Transcript Is Nothing Then Return String.Empty
        Return turn.Transcript.Trim()
    End Function

    Private Function MergeIntoConversation(
        conversation As Models.AgentSessionState,
        conceptsInUtterance As IList(Of Models.Concept),
        utterance As String
    ) As Models.AgentSessionState
        Dim prior = If(conversation IsNot Nothing AndAlso conversation.AcquiredConcepts IsNot Nothing,
            conversation.AcquiredConcepts, New List(Of Models.Concept)())

        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.MergeAcquired(prior, conceptsInUtterance),
            .SelectedPath = If(conversation IsNot Nothing, conversation.SelectedPath, Nothing),
            .NoMatchCount = If(conversation IsNot Nothing, conversation.NoMatchCount, 0),
            .LastTranscript = If(String.IsNullOrWhiteSpace(utterance) AndAlso conversation IsNot Nothing,
                conversation.LastTranscript, utterance.Trim()),
            .PendingConstraint = If(conversation IsNot Nothing, conversation.PendingConstraint, Nothing)
        }
    End Function

    Private Function NextStep(
        bundle As Models.AgentBundle,
        priorConversation As Models.AgentSessionState,
        conversation As Models.AgentSessionState,
        conceptsInUtterance As IList(Of Models.Concept),
        candidatePaths As IList(Of String),
        confirmImplicit As Boolean
    ) As Models.AgentTurnResult
        If candidatePaths.Count = 0 Then
            Dim acquiredCount = ConceptOps.AcquiredCount(conversation.AcquiredConcepts)
            Dim hint = If(
                acquiredCount = 0 AndAlso Not String.IsNullOrWhiteSpace(bundle.Ontology.StartQuestion),
                bundle.Ontology.StartQuestion.Trim(),
                If(acquiredCount = 0, "Non ho capito. Può ripetere?", "Nessuna prestazione compatibile con i criteri indicati."))
            Return TurnResultBuilder.NoMatch(
                conversation, priorConversation, conceptsInUtterance, hint, 0, New List(Of String)())
        End If

        If AgentSlotMatch.ShouldAskAge(bundle, candidatePaths, conversation) Then
            Return TurnResultBuilder.AskAge(conversation, conceptsInUtterance, "FASCIA DI ETÀ", candidatePaths)
        End If

        If candidatePaths.Count = 1 Then
            Return TurnResultBuilder.Confirm(bundle, conversation, candidatePaths(0), conceptsInUtterance, candidatePaths)
        End If

        If confirmImplicit Then
            Dim inferred = AgentSlotMatch.FindInferredConcept(bundle, candidatePaths, conversation.AcquiredConcepts)
            If inferred IsNot Nothing Then
                Return TurnResultBuilder.ConfirmImplicit(conversation, conceptsInUtterance, inferred, candidatePaths)
            End If
        End If

        Dim disambiguation = AgentSlotMatch.FindDisambiguationTarget(bundle, candidatePaths, conversation.AcquiredConcepts)
        If disambiguation IsNot Nothing Then
            Return TurnResultBuilder.Disambiguate(conversation, conceptsInUtterance, disambiguation, candidatePaths)
        End If

        Return TurnResultBuilder.NoMatch(
            conversation, priorConversation, conceptsInUtterance,
            "Ho bisogno di un dettaglio in più per individuare la prestazione.",
            candidatePaths.Count, candidatePaths)
    End Function

    Private Function IsCollectingConstraintValue(conversation As Models.AgentSessionState) As Boolean
        Return conversation IsNot Nothing AndAlso conversation.PendingConstraint IsNot Nothing AndAlso
               conversation.PendingConstraint.ValueKind = "age_years"
    End Function

    Private Function PendingAgeCategoryName(conversation As Models.AgentSessionState) As String
        If conversation IsNot Nothing AndAlso conversation.PendingConstraint IsNot Nothing AndAlso
           Not String.IsNullOrWhiteSpace(conversation.PendingConstraint.CategoryName) Then
            Return conversation.PendingConstraint.CategoryName.Trim()
        End If
        Return "FASCIA DI ETÀ (VINCOLO)"
    End Function

    Private Function FinishTurn(result As Models.AgentTurnResult) As Models.AgentTurnResult
        result.Instruction = TurnExpectedInput.WithExpectedInput(result.Instruction)
        If result.Instruction.Action = "confirm" OrElse result.Instruction.Action = "already_done" Then
            result.NextState.PendingConstraint = Nothing
        Else
            result.NextState.PendingConstraint = TurnExpectedInput.BuildPendingConstraint(result.Instruction)
        End If
        Return result
    End Function

End Module
