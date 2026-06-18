''' <summary>
''' Agent turn: route utterance vs external slots, merge conversation, filter catalog, next step.
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
        Dim earlyExit = TryAlreadyDoneResult(bundle, conversation)
        If earlyExit IsNot Nothing Then Return earlyExit

        If HasExternalSlots(turn) Then
            Return FinishTurn(bundle, ProcessExternalSlots(bundle, conversation, turn))
        End If

        Return FinishTurn(bundle, ProcessUtterance(bundle, conversation, turn))
    End Function

    Public Function ProcessAgentTurnFromText(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        userText As String
    ) As Models.AgentTurnResult
        Dim earlyExit = TryAlreadyDoneResult(bundle, conversation)
        If earlyExit IsNot Nothing Then Return earlyExit
        Dim turn = New Models.AgentTurnInput With {.Transcript = If(userText, String.Empty).Trim()}
        Return FinishTurn(bundle, ProcessUtterance(bundle, conversation, turn))
    End Function

    Public Function FormatAgentParsedBlock(
        parsed As IList(Of Models.Concept),
        instruction As Models.AgentTurnInstruction
    ) As String
        Dim lines = parsed.Select(Function(p) $"{p.Category}: {p.Value}").ToList()
        lines.Add($"PROSSIMA_AZIONE: {instruction.Action}")
        Return $"---PARSED---{Environment.NewLine}{String.Join(Environment.NewLine, lines)}"
    End Function

    Private Function TryAlreadyDoneResult(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState
    ) As Models.AgentTurnResult
        If conversation Is Nothing OrElse String.IsNullOrEmpty(conversation.SelectedPath) Then Return Nothing
        Return FinishTurn(bundle, TurnResultBuilder.AlreadyDone(conversation, New List(Of Models.Concept)()))
    End Function

    Private Function HasExternalSlots(turn As Models.AgentTurnInput) As Boolean
        Return turn IsNot Nothing AndAlso turn.IncomingConcepts IsNot Nothing AndAlso turn.IncomingConcepts.Count > 0
    End Function

    Private Function ProcessUtterance(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput
    ) As Models.AgentTurnResult
        Dim transcript = If(turn IsNot Nothing AndAlso turn.Transcript IsNot Nothing, turn.Transcript.Trim(), String.Empty)
        Dim conceptsThisTurn = ExtractConceptsFromTranscript(bundle, conversation, transcript)
        Return ContinueDialogStep(bundle, conversation, turn, conceptsThisTurn, transcript)
    End Function

    Private Function ProcessExternalSlots(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput
    ) As Models.AgentTurnResult
        Dim externalSlots = If(turn IsNot Nothing AndAlso turn.IncomingConcepts IsNot Nothing,
            turn.IncomingConcepts, New List(Of Models.Concept)())
        Dim conceptsThisTurn = ValidateAndNormalizeExternalSlots(bundle, conversation, externalSlots)

        Dim transcript = If(turn IsNot Nothing AndAlso turn.Transcript IsNot Nothing, turn.Transcript.Trim(), String.Empty)
        If Not String.IsNullOrWhiteSpace(transcript) Then
            Dim fromTranscript = ExtractConceptsFromTranscript(bundle, conversation, transcript)
            conceptsThisTurn = ConceptOps.MergeAcquired(fromTranscript, conceptsThisTurn, bundle.Ontology)
        End If

        Return ContinueDialogStep(bundle, conversation, turn, conceptsThisTurn, transcript)
    End Function

    Private Function ExtractConceptsFromTranscript(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        transcript As String
    ) As List(Of Models.Concept)
        If String.IsNullOrWhiteSpace(transcript) Then Return New List(Of Models.Concept)()

        Dim pendingOnly = IsCollectingConstraintValue(conversation)
        Dim pendingCategory = If(pendingOnly, PendingVincoloCategoryName(conversation, bundle), Nothing)
        Dim extracted = ConceptExtraction.ExtractConceptsFromUtterance(
            transcript, bundle.Ontology, pendingCategory, pendingOnly)
        Return ConceptExtraction.NormalizeExtractedConcepts(extracted, bundle.Ontology)
    End Function

    Private Function ValidateAndNormalizeExternalSlots(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        externalSlots As IList(Of Models.Concept)
    ) As List(Of Models.Concept)
        Dim slots = If(externalSlots IsNot Nothing, externalSlots, New List(Of Models.Concept)())
        If slots.Count = 0 Then Return New List(Of Models.Concept)()

        Dim normalized = ConceptExtraction.NormalizeExtractedConcepts(slots, bundle.Ontology)
        If normalized.Count = 0 Then Return normalized

        Dim priorCandidates = AgentSlotMatch.PriorCandidates(bundle, conversation)
        Dim validationCandidates = priorCandidates
        If validationCandidates.Count = 0 AndAlso bundle IsNot Nothing AndAlso bundle.Catalog IsNot Nothing AndAlso bundle.Catalog.Items IsNot Nothing Then
            validationCandidates = bundle.Catalog.Items
        End If
        Return IncomingConcepts.FilterIncomingConcepts(
            bundle, normalized, If(conversation IsNot Nothing, conversation.PendingConstraint, Nothing), validationCandidates)
    End Function

    Private Function ContinueDialogStep(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        turn As Models.AgentTurnInput,
        conceptsThisTurn As IList(Of Models.Concept),
        transcript As String
    ) As Models.AgentTurnResult
        Dim priorConversation = conversation
        conversation = MergeIntoConversation(bundle, conversation, conceptsThisTurn, transcript)

        Dim candidates = CatalogFilter.FilterCandidates(bundle.Catalog, conversation)
        Dim confirmImplicit = turn IsNot Nothing AndAlso turn.ConfirmImplicitConcepts

        Return NextStep(bundle, priorConversation, conversation, conceptsThisTurn, candidates, confirmImplicit)
    End Function

    Private Function MergeIntoConversation(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        conceptsInUtterance As IList(Of Models.Concept),
        utterance As String
    ) As Models.AgentSessionState
        Dim prior = If(conversation IsNot Nothing AndAlso conversation.AcquiredConcepts IsNot Nothing,
            conversation.AcquiredConcepts, New List(Of Models.Concept)())
        Dim ontology = If(bundle IsNot Nothing, bundle.Ontology, Nothing)

        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.MergeAcquired(prior, conceptsInUtterance, ontology),
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
        candidates As IList(Of Models.CatalogItem),
        confirmImplicit As Boolean
    ) As Models.AgentTurnResult
        Dim survivingPaths = AgentSlotMatch.CandidatePaths(candidates)

        If candidates Is Nothing OrElse candidates.Count = 0 Then
            Dim acquiredCount = ConceptOps.AcquiredCount(conversation.AcquiredConcepts)
            Dim hint = If(
                acquiredCount = 0 AndAlso Not String.IsNullOrWhiteSpace(bundle.Ontology.StartQuestion),
                bundle.Ontology.StartQuestion.Trim(),
                If(acquiredCount = 0, "Non ho capito. Può ripetere?", "Nessuna prestazione compatibile con i criteri indicati."))
            Return TurnResultBuilder.NoMatch(
                conversation, priorConversation, conceptsInUtterance, hint, 0, survivingPaths)
        End If

        If AgentSlotMatch.ShouldAskAge(bundle, candidates, conversation) Then
            Dim ageCategory = CategoryTypes.FirstAgeVincoloCategory(bundle.Ontology)
            Dim categoryName = If(ageCategory IsNot Nothing, ageCategory.Name, "fascia di età")
            Return TurnResultBuilder.AskAge(conversation, conceptsInUtterance, categoryName, survivingPaths)
        End If

        If candidates.Count = 1 Then
            Return TurnResultBuilder.Confirm(bundle, conversation, candidates(0).Path, conceptsInUtterance, survivingPaths)
        End If

        If confirmImplicit Then
            Dim inferred = AgentSlotMatch.FindInferredConcept(bundle, candidates, conversation.AcquiredConcepts)
            If inferred IsNot Nothing Then
                Return TurnResultBuilder.ConfirmImplicit(conversation, conceptsInUtterance, inferred, survivingPaths)
            End If
        End If

        Dim disambiguation = AgentSlotMatch.FindDisambiguationTarget(bundle, candidates, conversation.AcquiredConcepts)
        If disambiguation IsNot Nothing Then
            Return TurnResultBuilder.Disambiguate(conversation, conceptsInUtterance, disambiguation, survivingPaths)
        End If

        Return TurnResultBuilder.NoMatch(
            conversation, priorConversation, conceptsInUtterance,
            "Ho bisogno di un dettaglio in più per individuare la prestazione.",
            candidates.Count, survivingPaths)
    End Function

    Private Function IsCollectingConstraintValue(conversation As Models.AgentSessionState) As Boolean
        Return conversation IsNot Nothing AndAlso conversation.PendingConstraint IsNot Nothing AndAlso
               String.Equals(conversation.PendingConstraint.ValueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase)
    End Function

    Private Function PendingVincoloCategoryName(
        conversation As Models.AgentSessionState,
        bundle As Models.AgentBundle
    ) As String
        If conversation IsNot Nothing AndAlso conversation.PendingConstraint IsNot Nothing AndAlso
           Not String.IsNullOrWhiteSpace(conversation.PendingConstraint.CategoryName) Then
            Return conversation.PendingConstraint.CategoryName.Trim()
        End If
        Dim fromBundle = CategoryTypes.FirstAgeVincoloCategory(If(bundle IsNot Nothing, bundle.Ontology, Nothing))
        If fromBundle IsNot Nothing Then Return fromBundle.Name
        Return "fascia di età"
    End Function

    Private Function FinishTurn(
        bundle As Models.AgentBundle,
        result As Models.AgentTurnResult
    ) As Models.AgentTurnResult
        result.Instruction = TurnExpectedInput.WithExpectedInput(result.Instruction, bundle)
        If result.Instruction.Action = "confirm" OrElse result.Instruction.Action = "already_done" Then
            result.NextState.PendingConstraint = Nothing
        Else
            result.NextState.PendingConstraint = TurnExpectedInput.BuildPendingConstraint(result.Instruction)
        End If
        Return result
    End Function

End Module
