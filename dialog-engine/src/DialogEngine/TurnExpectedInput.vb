''' <summary>
''' Attaches vincolo contract to ask_age instructions for ConvAI / ElevenLabs.
''' </summary>
Public Module TurnExpectedInput

    Private Const AgeYearsDescription As String =
        "Età del paziente in anni come numero intero (es. ""30""). NON usare token vincolo/fascia dal catalogo (es. ""over 17 anni"")."

    Public Function BuildAskAgeConstraint(categoryName As String) As Models.ExpectedConstraint
        Return New Models.ExpectedConstraint With {
            .CategoryName = categoryName,
            .ValueKind = CategoryTypes.ValueKindAgeYears,
            .Description = AgeYearsDescription
        }
    End Function

    Public Function WithExpectedInput(
        instruction As Models.AgentTurnInstruction,
        Optional bundle As Models.AgentBundle = Nothing
    ) As Models.AgentTurnInstruction
        If instruction Is Nothing Then Return Nothing

        If instruction.Action = "ask_age" Then
            Dim categoryName = ResolveAskAgeCategoryName(instruction, bundle)
            instruction.ExpectedConstraints = New List(Of Models.ExpectedConstraint) From {
                BuildAskAgeConstraint(categoryName)
            }
        End If

        Return instruction
    End Function

    Private Function ResolveAskAgeCategoryName(
        instruction As Models.AgentTurnInstruction,
        bundle As Models.AgentBundle
    ) As String
        If Not String.IsNullOrWhiteSpace(instruction.CategoryName) Then
            Return instruction.CategoryName.Trim()
        End If

        Dim fromBundle = CategoryTypes.FirstAgeVincoloCategory(If(bundle IsNot Nothing, bundle.Ontology, Nothing))
        If fromBundle IsNot Nothing Then Return fromBundle.Name

        Return "fascia di età"
    End Function

    Public Function BuildPendingConstraint(instruction As Models.AgentTurnInstruction) As Models.ExpectedConstraint
        If instruction Is Nothing OrElse instruction.Action <> "ask_age" Then Return Nothing
        If instruction.ExpectedConstraints Is Nothing OrElse instruction.ExpectedConstraints.Count = 0 Then Return Nothing
        Return instruction.ExpectedConstraints(0)
    End Function

End Module
