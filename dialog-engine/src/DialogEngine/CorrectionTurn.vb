''' <summary>
''' Pre-flight handler for retroactive user corrections (overwrite + negation + LIFO rollback).
''' </summary>
Public Module CorrectionTurn

    ''' <summary>Returns a turn result when utterance is a correction; otherwise Nothing.</summary>
    Public Function TryHandle(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        transcript As String,
        Optional confirmImplicit As Boolean = False
    ) As Models.AgentTurnResult
        If bundle Is Nothing OrElse String.IsNullOrWhiteSpace(transcript) Then Return Nothing

        Dim correction = CorrectionIntent.TryParse(transcript)
        If Not correction.IsCorrection Then Return Nothing

        Dim extraction = CategoryNegationMatch.ExtractFromCorrectionPayload(
            correction.PayloadText, bundle.Ontology)
        Dim positiveConcepts = ConceptExtraction.NormalizeExtractedConcepts(
            extraction.PositiveConcepts, bundle.Ontology)

        If positiveConcepts.Count = 0 AndAlso extraction.NegatedCategories.Count = 0 Then
            Return Nothing
        End If

        Dim priorConversation = conversation
        Dim working = CloneConversationWithoutPending(conversation)

        Dim negationConcepts = BuildNegationConcepts(bundle.Ontology, extraction.NegatedCategories)
        RemoveAcquiredCategories(working, extraction.NegatedCategories)

        Dim protectedCategories = BuildProtectedCategories(positiveConcepts, extraction.NegatedCategories)
        Dim conceptsThisTurn = positiveConcepts.Concat(negationConcepts).ToList()

        Dim exactCategories = ConceptOps.ResolveExactAttributoCommits(
            CloneConversationWithoutPending(priorConversation), conceptsThisTurn)

        working = AgentDialogStep.MergeIntoConversation(
            bundle, working, conceptsThisTurn, transcript, exactCategories, pendingConstraint:=Nothing)

        working = CorrectionRollback.RollbackUntilCandidates(bundle, working, protectedCategories)

        Dim candidates = CatalogFilter.FilterCandidates(bundle.Catalog, working)
        Return AgentDialogStep.ResolveNextStep(
            bundle, priorConversation, working, conceptsThisTurn, candidates, confirmImplicit)
    End Function

    Private Function BuildNegationConcepts(
        ontology As Models.Ontology,
        negatedCategories As IList(Of String)
    ) As List(Of Models.Concept)
        Dim concepts As New List(Of Models.Concept)()
        If ontology Is Nothing OrElse negatedCategories Is Nothing Then Return concepts

        For Each categoryName In negatedCategories
            If String.IsNullOrWhiteSpace(categoryName) Then Continue For
            Dim trimmed = categoryName.Trim()
            Dim category = CategoryTypes.FindCategoryByName(ontology, trimmed)
            If category Is Nothing Then Continue For
            If Not CategorySupportsExplicitNone(category) Then Continue For

            concepts.Add(ValueSetOps.CreateAttributoConcept(
                trimmed,
                New List(Of String) From {CategoryTypes.MissingCategoryValue}))
        Next

        Return concepts
    End Function

    Private Function CategorySupportsExplicitNone(category As Models.CategoryDefinition) As Boolean
        If category Is Nothing OrElse category.AllowedValues Is Nothing Then Return False
        Return category.AllowedValues.Any(Function(v) CategoryTypes.IsMissingCategoryValue(v))
    End Function

    Private Function BuildProtectedCategories(
        positiveConcepts As IList(Of Models.Concept),
        negatedCategories As IList(Of String)
    ) As HashSet(Of String)
        Dim protectedSet As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)

        If positiveConcepts IsNot Nothing Then
            For Each concept In positiveConcepts
                If concept Is Nothing OrElse String.IsNullOrWhiteSpace(concept.Category) Then Continue For
                protectedSet.Add(concept.Category.Trim())
            Next
        End If

        If negatedCategories IsNot Nothing Then
            For Each categoryName In negatedCategories
                If Not String.IsNullOrWhiteSpace(categoryName) Then protectedSet.Add(categoryName.Trim())
            Next
        End If

        Return protectedSet
    End Function

    Private Sub RemoveAcquiredCategories(
        conversation As Models.AgentSessionState,
        categoryNames As IList(Of String)
    )
        If conversation Is Nothing OrElse categoryNames Is Nothing OrElse categoryNames.Count = 0 Then Return

        Dim removeSet As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        For Each name In categoryNames
            If Not String.IsNullOrWhiteSpace(name) Then removeSet.Add(name.Trim())
        Next
        If removeSet.Count = 0 Then Return

        conversation.AcquiredConcepts?.RemoveAll(
            Function(c) c IsNot Nothing AndAlso removeSet.Contains(c.Category.Trim()))
        conversation.ExactAttributoCategories?.RemoveAll(
            Function(c) removeSet.Contains(c.Trim()))
    End Sub

    Private Function CloneConversationWithoutPending(
        conversation As Models.AgentSessionState
    ) As Models.AgentSessionState
        If conversation Is Nothing Then Return AgentTurnEngine.InitAgentSession()

        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.CloneConceptList(conversation.AcquiredConcepts),
            .ExactAttributoCategories = ConceptOps.CloneExactAttributoCategories(conversation.ExactAttributoCategories),
            .SelectedPath = conversation.SelectedPath,
            .NoMatchCount = conversation.NoMatchCount,
            .LastTranscript = conversation.LastTranscript,
            .PendingConstraint = Nothing
        }
    End Function

End Module
