Imports DialogEngine.Models
Imports Xunit

Public Class AgentTurnEngineTests

    <Fact>
    Public Sub AsksAge_WhenSlotsMatchMultipleAgeVincoloItems()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        })
        Assert.Equal("ask_age", result.Instruction.Action)
        Assert.Equal(ConstraintValidation.AgeYearsQuestion, result.SpokenHint)
        Assert.Equal(2, result.CandidateCount)
    End Sub

    <Fact>
    Public Sub ConfirmsAdultItem_AfterAgeSlot()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim state = AgentTurnEngine.InitAgentSession()
        state = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "fascia di età", .Value = "30"}
            }
        })
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Equal(30, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
        Assert.Contains("Visita cardiologica adulta", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub Disambiguates_OnFirstCategoryWithTwoDistinctValues()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Contains("target", result.Instruction.CategoryName.ToLowerInvariant())
        Assert.Equal(New List(Of String) From {"adulto", "pediatrica"}, result.Instruction.Options)
        Assert.Contains("adulto", result.SpokenHint)
        Assert.Contains("pediatrica", result.SpokenHint)
        Assert.Equal("template", result.SpokenHintSource)
    End Sub

    <Fact>
    Public Sub Disambiguates_WithPlanMessage_WhenConfigured()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        bundle.Ontology.DisambiguationPlan = New DisambiguationPlan With {
            .Messages = New List(Of DisambiguationMessage) From {
                New DisambiguationMessage With {
                    .Signature = "target||adulto|pediatrica||choice",
                    .CategoryName = "target",
                    .Question = "La visita è per un adulto o per un minore?",
                    .Style = "choice"
                }
            }
        }
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Equal("La visita è per un adulto o per un minore?", result.SpokenHint)
        Assert.Equal("disambiguation_plan", result.SpokenHintSource)
        Assert.Equal("target||adulto|pediatrica||choice", result.DisambiguationSignature)
    End Sub

    <Fact>
    Public Sub AskAge_WithPlanMessage_WhenConfigured()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        bundle.Ontology.DisambiguationPlan = New DisambiguationPlan With {
            .Messages = New List(Of DisambiguationMessage) From {
                New DisambiguationMessage With {
                    .Signature = "vincolo||fascia di età||ask",
                    .CategoryName = "fascia di età",
                    .Question = "Quanti anni compi il paziente?",
                    .Style = "ask_age"
                }
            }
        }
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        })
        Assert.Equal("ask_age", result.Instruction.Action)
        Assert.Equal("Quanti anni compi il paziente?", result.SpokenHint)
        Assert.Equal("disambiguation_plan", result.SpokenHintSource)
        Assert.Equal("vincolo||fascia di età||ask", result.DisambiguationSignature)
    End Sub

    <Fact>
    Public Sub AskAge_IncludesExpectedInputContract()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        })
        Assert.Equal("age_years", result.Instruction.ExpectedConstraints(0).ValueKind)
        Assert.Equal("fascia di età", result.Instruction.ExpectedConstraints(0).CategoryName)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ExtractsSpecialitaAndDisambiguates()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "visita cardiologica"
        )
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.NotEqual(bundle.Ontology.StartQuestion, result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ConfirmsAdult_AfterBareAgeWhilePendingVincolo()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        Dim state = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "cardiologica"
        ).NextState
        Assert.NotNull(state.PendingConstraint)
        Assert.Equal("age_years", state.PendingConstraint.ValueKind)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "18")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal(18, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Contains("Visita cardiologica adulta", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ConfirmsAdult_WhenAgeAndSpecialtyInSameUtterance()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        TestBundleFactory.AddAgeVincoloResolution(bundle)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "visita cardiologica mio figlio ha venti anni"
        )
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Equal(20, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
    End Sub

    <Fact>
    Public Sub Disambiguates_WithNone_WhenOptionalCategoryMissingOnShorterPath()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Contains("ecg", result.Instruction.CategoryName.ToLowerInvariant())
        Assert.Equal(New List(Of String) From {"ecg", "none"}, result.Instruction.Options)
        Assert.Equal(CategoryTypes.ValueKindCanonicalToken, result.NextState.PendingConstraint.ValueKind)
        Assert.Equal(New List(Of String) From {"ecg", "none"}, result.NextState.PendingConstraint.AllowedTokens)
    End Sub

    <Fact>
    Public Sub ConfirmsBasePath_WhenOptionalCategoryDeclinedViaText()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "no")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima", result.NextState.SelectedPath)
        Assert.Contains("Visita cardiologica prima", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ConfirmsExtendedPath_WhenOptionalCategoryAcceptedViaText()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "sì")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg", result.NextState.SelectedPath)
        Assert.Contains("ECG", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ConfirmsExtendedPath_WhenOptionalCategoryNamedViaText()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "ecg")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg", result.NextState.SelectedPath)
    End Sub

    <Fact>
    Public Sub ConfirmsBasePath_WhenOptionalCategoryDeclinedViaNessuno()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "nessuno")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima", result.NextState.SelectedPath)
        Assert.True(result.NextState.AcquiredConcepts.Any(
            Function(ac) ac.Category = "ECG" AndAlso ac.Value = CategoryTypes.MissingCategoryValue))
    End Sub

    <Fact>
    Public Sub ParsesSiAsCanonicalToken_WhenPendingDisambiguation()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"},
                New Concept With {.Category = "tipo visita", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "si")
        Assert.Single(result.Parsed)
        Assert.Equal("ECG", result.Parsed(0).Category)
        Assert.Equal("ecg", result.Parsed(0).Value)
    End Sub

    <Fact>
    Public Sub ConfirmsAdultPath_WhenDisambiguationAnswerMatchesChoice()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "adulto")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Contains("adulto", result.NextState.SelectedPath)
    End Sub

    <Fact>
    Public Sub Disambiguate_IncludesExpectedInputContract()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        })
        Assert.Equal("canonical_token", result.Instruction.ExpectedConstraints(0).ValueKind)
        Assert.Equal("target", result.Instruction.ExpectedConstraints(0).CategoryName)
        Assert.Equal(New List(Of String) From {"adulto", "pediatrica"}, result.Instruction.ExpectedConstraints(0).AllowedTokens)
    End Sub

    <Fact>
    Public Sub HttpResponse_BuildsWebhookPayload()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim turn = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        })
        Dim http = HttpResponseBuilder.BuildAgentDialogStepHttpResponse("conv-1", "doc-1", turn)
        Assert.True(http.Ok)
        Assert.Equal("disambiguate", http.Instruction.Action)
        Assert.False(String.IsNullOrEmpty(http.SpokenHint))
        Assert.Contains("DISAMBIGUATE", http.Debug.Log)
    End Sub

End Class
