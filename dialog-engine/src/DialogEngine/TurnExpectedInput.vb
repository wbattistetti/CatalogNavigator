''' <summary>
''' Attaches vincolo contract to ask_age instructions for ConvAI / ElevenLabs.
''' </summary>
Public Module TurnExpectedInput

    Private Const DefaultAgeCategory As String = "FASCIA DI ETÀ (VINCOLO)"

    Public Function BuildAskAgeConstraint(Optional categoryName As String = Nothing) As Models.ExpectedConstraint
        Dim name = If(String.IsNullOrWhiteSpace(categoryName), DefaultAgeCategory, categoryName)
        Return New Models.ExpectedConstraint With {
            .CategoryName = name,
            .ValueKind = "age_years",
            .Description = "Età del paziente in anni come numero intero (es. ""30""). NON usare token vincolo/fascia dal catalogo (es. ""over 17 anni"")."
        }
    End Function

    Private Function AgeCategoryLabelForExpected(categoryName As String) As String
        Dim baseName = If(String.IsNullOrWhiteSpace(categoryName), "FASCIA DI ETÀ", categoryName.Trim())
        If baseName.ToLowerInvariant().Contains("vincolo") Then Return baseName
        Return baseName & " (VINCOLO)"
    End Function

    Public Function WithExpectedInput(instruction As Models.AgentTurnInstruction) As Models.AgentTurnInstruction
        If instruction Is Nothing Then Return Nothing

        If instruction.Action = "ask_age" Then
            instruction.ExpectedConstraints = New List(Of Models.ExpectedConstraint) From {
                BuildAskAgeConstraint(AgeCategoryLabelForExpected(instruction.CategoryName))
            }
        End If

        Return instruction
    End Function

    Public Function BuildPendingConstraint(instruction As Models.AgentTurnInstruction) As Models.ExpectedConstraint
        If instruction Is Nothing OrElse instruction.Action <> "ask_age" Then Return Nothing
        If instruction.ExpectedConstraints Is Nothing OrElse instruction.ExpectedConstraints.Count = 0 Then Return Nothing
        Return instruction.ExpectedConstraints(0)
    End Function

End Module
