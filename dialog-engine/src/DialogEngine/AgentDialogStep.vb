''' <summary>
''' Shared dialog progression after conversation state is merged (confirm, disambiguate, no_match).
''' </summary>
Public Module AgentDialogStep

    Public Function MergeIntoConversation(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        conceptsInUtterance As IList(Of Models.Concept),
        utterance As String,
        exactAttributoCategories As IList(Of String),
        Optional pendingConstraint As Models.ExpectedConstraint = Nothing
    ) As Models.AgentSessionState
        Dim prior = If(conversation IsNot Nothing AndAlso conversation.AcquiredConcepts IsNot Nothing,
            conversation.AcquiredConcepts, New List(Of Models.Concept)())
        Dim ontology = If(bundle IsNot Nothing, bundle.Ontology, Nothing)

        Dim pending = pendingConstraint
        If pending Is Nothing AndAlso conversation IsNot Nothing Then
            pending = conversation.PendingConstraint
        End If

        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.MergeAcquired(prior, conceptsInUtterance, ontology),
            .ExactAttributoCategories = ConceptOps.CloneExactAttributoCategories(exactAttributoCategories),
            .SelectedPath = If(conversation IsNot Nothing, conversation.SelectedPath, Nothing),
            .NoMatchCount = If(conversation IsNot Nothing, conversation.NoMatchCount, 0),
            .LastTranscript = If(String.IsNullOrWhiteSpace(utterance) AndAlso conversation IsNot Nothing,
                conversation.LastTranscript, utterance.Trim()),
            .PendingConstraint = pending
        }
    End Function

    Public Function ResolveNextStep(
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
            Return TurnResultBuilder.AskAge(bundle, conversation, conceptsInUtterance, categoryName, survivingPaths)
        End If

        If candidates.Count = 1 Then
            Return TurnResultBuilder.Confirm(bundle, conversation, candidates(0).Path, conceptsInUtterance, survivingPaths)
        End If

        If confirmImplicit Then
            Dim inferred = AgentSlotMatch.FindInferredConcept(
                bundle, candidates, conversation.AcquiredConcepts, conversation.ExactAttributoCategories)
            If inferred IsNot Nothing Then
                Return TurnResultBuilder.ConfirmImplicit(conversation, conceptsInUtterance, inferred, survivingPaths)
            End If
        End If

        Dim disambiguation = AgentSlotMatch.FindDisambiguationTarget(
            bundle, candidates, conversation.AcquiredConcepts, conversation.ExactAttributoCategories)
        If disambiguation IsNot Nothing Then
            Return TurnResultBuilder.Disambiguate(bundle, conversation, conceptsInUtterance, disambiguation, survivingPaths)
        End If

        Return TurnResultBuilder.NoMatch(
            conversation, priorConversation, conceptsInUtterance,
            "Ho bisogno di un dettaglio in più per individuare la prestazione.",
            candidates.Count, survivingPaths)
    End Function

End Module
