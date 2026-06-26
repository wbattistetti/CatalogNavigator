''' <summary>
''' LIFO rollback of acquired concepts when a correction yields zero catalog candidates.
''' </summary>
Public Module CorrectionRollback

    ''' <summary>
    ''' Removes the most recently acquired non-protected categories until candidates exist or none remain.
    ''' </summary>
    Public Function RollbackUntilCandidates(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        protectedCategories As ICollection(Of String)
    ) As Models.AgentSessionState
        If bundle Is Nothing OrElse conversation Is Nothing Then Return conversation

        Dim protectedSet As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        If protectedCategories IsNot Nothing Then
            For Each name In protectedCategories
                If Not String.IsNullOrWhiteSpace(name) Then protectedSet.Add(name.Trim())
            Next
        End If

        Dim current = CloneConversation(conversation)
        While True
            Dim candidates = CatalogFilter.FilterCandidates(bundle.Catalog, current)
            If candidates IsNot Nothing AndAlso candidates.Count > 0 Then Return current

            If Not RemoveMostRecentNonProtectedCategory(current, protectedSet) Then Return current
        End While

        Return current
    End Function

    Private Function RemoveMostRecentNonProtectedCategory(
        conversation As Models.AgentSessionState,
        protectedCategories As HashSet(Of String)
    ) As Boolean
        Dim acquired = conversation.AcquiredConcepts
        If acquired Is Nothing OrElse acquired.Count = 0 Then Return False

        Dim removeIndex = -1
        For i = acquired.Count - 1 To 0 Step -1
            Dim concept = acquired(i)
            If concept Is Nothing OrElse String.IsNullOrWhiteSpace(concept.Category) Then Continue For
            Dim categoryName = concept.Category.Trim()
            If protectedCategories.Contains(categoryName) Then Continue For
            removeIndex = i
            Exit For
        Next

        If removeIndex < 0 Then Return False

        Dim removedCategory = acquired(removeIndex).Category.Trim()
        acquired.RemoveAt(removeIndex)
        conversation.ExactAttributoCategories?.RemoveAll(
            Function(c) String.Equals(c, removedCategory, StringComparison.OrdinalIgnoreCase))
        Return True
    End Function

    Private Function CloneConversation(conversation As Models.AgentSessionState) As Models.AgentSessionState
        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.CloneConceptList(conversation.AcquiredConcepts),
            .ExactAttributoCategories = ConceptOps.CloneExactAttributoCategories(conversation.ExactAttributoCategories),
            .SelectedPath = conversation.SelectedPath,
            .NoMatchCount = conversation.NoMatchCount,
            .LastTranscript = conversation.LastTranscript,
            .PendingConstraint = conversation.PendingConstraint
        }
    End Function

End Module
