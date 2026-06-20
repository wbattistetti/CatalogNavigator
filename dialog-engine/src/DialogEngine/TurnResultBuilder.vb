''' <summary>
''' Builds AgentTurnResult payloads (instruction, spoken hint, next conversation state).
''' </summary>
Public Module TurnResultBuilder

    Public Function Build(
        conversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept),
        instruction As Models.AgentTurnInstruction,
        spokenHint As String,
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Dim paths = If(survivingPaths IsNot Nothing, survivingPaths, New List(Of String)())
        Return New Models.AgentTurnResult With {
            .Instruction = instruction,
            .Parsed = ParsedList(parsedThisTurn),
            .SpokenHint = spokenHint,
            .CandidateCount = paths.Count,
            .SurvivingPaths = paths.ToList(),
            .NextState = CloneConversation(conversation)
        }
    End Function

    Public Function AlreadyDone(
        conversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept)
    ) As Models.AgentTurnResult
        Return Build(
            conversation,
            parsedThisTurn,
            New Models.AgentTurnInstruction With {.Action = "already_done", .Path = conversation.SelectedPath},
            String.Empty,
            New List(Of String)())
    End Function

    Public Function Confirm(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        path As String,
        parsedThisTurn As IList(Of Models.Concept),
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Dim node = BundleAccess.FindDialogNode(bundle, path)
        Dim spokenHint = If(node IsNot Nothing,
            DialogPhrases.FormatLeafConfirmation(path, node, bundle.Ontology?.ConfirmationPreamble),
            "Confermo: " & path)

        Dim nextConversation = CloneConversation(conversation)
        nextConversation.SelectedPath = path
        nextConversation.NoMatchCount = 0

        Return Build(
            nextConversation,
            parsedThisTurn,
            New Models.AgentTurnInstruction With {.Action = "confirm", .Path = path},
            spokenHint,
            survivingPaths)
    End Function

    Public Function AskAge(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept),
        categoryName As String,
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Dim resolved = DisambiguationCopy.ResolveVincoloAskHint(bundle, conversation, categoryName)
        Dim result = Build(
            conversation,
            parsedThisTurn,
            New Models.AgentTurnInstruction With {.Action = "ask_age", .CategoryName = categoryName},
            resolved.Text,
            survivingPaths)
        result.SpokenHintSource = resolved.Source
        result.DisambiguationSignature = resolved.Signature
        Return result
    End Function

    Public Function Disambiguate(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept),
        target As AgentSlotMatch.InferredDisambiguation,
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Dim resolved = DisambiguationCopy.ResolveDisambiguationHint(
            bundle, conversation, target.CategoryName, target.Options)

        Dim result = Build(
            conversation,
            parsedThisTurn,
            New Models.AgentTurnInstruction With {
                .Action = "disambiguate",
                .CategoryName = target.CategoryName,
                .Options = target.Options.ToList()
            },
            resolved.Text,
            survivingPaths)
        result.SpokenHintSource = resolved.Source
        result.DisambiguationSignature = resolved.Signature
        Return result
    End Function

    Public Function ConfirmImplicit(
        conversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept),
        inferred As AgentSlotMatch.InferredConcept,
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Return Build(
            conversation,
            parsedThisTurn,
            New Models.AgentTurnInstruction With {
                .Action = "confirm_implicit",
                .CategoryName = inferred.CategoryName,
                .ImplicitValue = inferred.ValueSetKey,
                .Options = New List(Of String) From {inferred.ValueSetKey}
            },
            DialogPhrases.FormatImplicitConceptConfirmHint(inferred.CategoryName, inferred.ValueSetKey),
            survivingPaths)
    End Function

    Public Function NoMatch(
        conversation As Models.AgentSessionState,
        priorConversation As Models.AgentSessionState,
        parsedThisTurn As IList(Of Models.Concept),
        spokenHint As String,
        candidateCount As Integer,
        survivingPaths As IList(Of String)
    ) As Models.AgentTurnResult
        Dim nextConversation = CloneConversation(conversation)
        nextConversation.NoMatchCount = Math.Min(priorConversation.NoMatchCount + 1, 2)

        Return New Models.AgentTurnResult With {
            .Instruction = New Models.AgentTurnInstruction With {.Action = "no_match"},
            .Parsed = ParsedList(parsedThisTurn),
            .SpokenHint = spokenHint,
            .CandidateCount = candidateCount,
            .SurvivingPaths = If(survivingPaths IsNot Nothing, survivingPaths, New List(Of String)()).ToList(),
            .NextState = nextConversation
        }
    End Function

    Private Function ParsedList(parsedThisTurn As IList(Of Models.Concept)) As List(Of Models.Concept)
        If parsedThisTurn Is Nothing Then Return New List(Of Models.Concept)()
        Return parsedThisTurn.Where(Function(c) c IsNot Nothing).ToList()
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
