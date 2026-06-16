''' <summary>
''' Maps internal turn results to the public webhook JSON contract for ElevenLabs.
''' </summary>
Public Module HttpResponseBuilder

    Public Function FormatInstructionLog(instruction As Models.AgentTurnInstruction) As String
        If instruction Is Nothing Then Return String.Empty

        Select Case instruction.Action
            Case "disambiguate"
                Return $"DISAMBIGUATE: category={If(instruction.CategoryName, "?")}"
            Case "confirm_implicit"
                Return $"CONFIRM_IMPLICIT: category={If(instruction.CategoryName, "?")} value={If(instruction.ImplicitValue, "?")}"
            Case "ask_age"
                Return "ASK_CONSTRAINT: age_years"
            Case "confirm"
                Return $"CONFIRM: path={If(instruction.Path, "?")}"
            Case "no_match"
                Return "NO_MATCH"
            Case "already_done"
                Return $"ALREADY_DONE: path={If(instruction.Path, "?")}"
            Case Else
                Return instruction.Action
        End Select
    End Function

    Public Function BuildAgentDialogStepHttpResponse(
        conversationId As String,
        documentId As String,
        result As Models.AgentTurnResult
    ) As Models.AgentDialogStepHttpResponse
        Return New Models.AgentDialogStepHttpResponse With {
            .Ok = True,
            .ConversationId = conversationId,
            .DocumentId = documentId,
            .Instruction = result.Instruction,
            .SpokenHint = result.SpokenHint,
            .CandidateCount = result.CandidateCount,
            .Debug = New Models.AgentDialogStepDebugPayload With {
                .Log = FormatInstructionLog(result.Instruction),
                .Parsed = result.Parsed,
                .ParsedBlock = AgentTurnEngine.FormatAgentParsedBlock(result.Parsed, result.Instruction),
                .SurvivingPaths = result.SurvivingPaths,
                .NextState = result.NextState
            }
        }
    End Function

    ''' <summary>Chat presenter: only the text to show in the internal test UI.</summary>
    Public Function ToChatMessage(result As Models.AgentTurnResult) As String
        Return If(result?.SpokenHint, String.Empty)
    End Function

End Module
