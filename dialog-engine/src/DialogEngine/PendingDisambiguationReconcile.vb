''' <summary>
''' Aligns session pending disambiguation with explicit answer context from the client (chat bubble metadata).
''' </summary>
Public Module PendingDisambiguationReconcile

    Public Function Reconcile(
        conversation As Models.AgentSessionState,
        answerContext As Models.DisambiguationAnswerContext
    ) As Models.AgentSessionState
        If answerContext Is Nothing Then Return conversation

        Dim categoryName = If(answerContext.CategoryName, String.Empty).Trim()
        If categoryName.Length = 0 Then Return conversation

        Dim options = NormalizeOptions(answerContext.Options)
        If options.Count = 0 Then Return conversation

        Dim valueKind = ResolveValueKind(answerContext.ValueKind)
        Dim expected = BuildExpectedConstraint(categoryName, valueKind, options)

        If conversation Is Nothing Then
            conversation = AgentTurnEngine.InitAgentSession()
        End If

        If PendingMatchesExpected(conversation.PendingConstraint, expected) Then
            Return conversation
        End If

        Return New Models.AgentSessionState With {
            .AcquiredConcepts = ConceptOps.CloneConceptList(conversation.AcquiredConcepts),
            .ExactAttributoCategories = ConceptOps.CloneExactAttributoCategories(conversation.ExactAttributoCategories),
            .SelectedPath = conversation.SelectedPath,
            .NoMatchCount = conversation.NoMatchCount,
            .LastTranscript = conversation.LastTranscript,
            .PendingConstraint = expected
        }
    End Function

    Private Function ResolveValueKind(raw As String) As String
        If String.Equals(raw, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase) Then
            Return CategoryTypes.ValueKindAgeYears
        End If
        Return CategoryTypes.ValueKindCanonicalToken
    End Function

    Private Function NormalizeOptions(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
            Select(Function(o) o.Trim()).
            ToList()
    End Function

    Private Function BuildExpectedConstraint(
        categoryName As String,
        valueKind As String,
        options As IList(Of String)
    ) As Models.ExpectedConstraint
        If String.Equals(valueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase) Then
            Return TurnExpectedInput.BuildAskAgeConstraint(categoryName)
        End If

        Return New Models.ExpectedConstraint With {
            .CategoryName = categoryName,
            .ValueKind = CategoryTypes.ValueKindCanonicalToken,
            .Description = TurnExpectedInput.BuildDisambiguationConstraint(
                New Models.AgentTurnInstruction With {
                    .Action = "disambiguate",
                    .CategoryName = categoryName,
                    .Options = options.ToList()
                }).Description,
            .AllowedTokens = options.ToList()
        }
    End Function

    Private Function PendingMatchesExpected(
        pending As Models.ExpectedConstraint,
        expected As Models.ExpectedConstraint
    ) As Boolean
        If pending Is Nothing OrElse expected Is Nothing Then Return False
        If Not String.Equals(pending.CategoryName?.Trim(), expected.CategoryName?.Trim(), StringComparison.OrdinalIgnoreCase) Then
            Return False
        End If
        If Not String.Equals(pending.ValueKind?.Trim(), expected.ValueKind?.Trim(), StringComparison.OrdinalIgnoreCase) Then
            Return False
        End If

        Dim pendingTokens = NormalizeOptions(pending.AllowedTokens)
        Dim expectedTokens = NormalizeOptions(expected.AllowedTokens)
        If pendingTokens.Count = 0 AndAlso expectedTokens.Count = 0 Then Return True
        If pendingTokens.Count <> expectedTokens.Count Then Return False

        Dim pendingSet = New HashSet(Of String)(pendingTokens, StringComparer.OrdinalIgnoreCase)
        Return expectedTokens.All(Function(t) pendingSet.Contains(t))
    End Function

End Module
