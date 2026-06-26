Imports DialogEngine.Models
Imports Xunit

Public Class AgentTurnEngineTests

    <Fact>
    Public Sub AsksAge_WhenSlotsMatchMultipleAgeVincoloItems()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Vincolo("fascia di età", "30")
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
                Attr("specialità", "cardiologica")
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
    Public Sub Disambiguates_OnDistinctValueSets()
        Dim bundle = TestBundleFactory.BuildMultiExamBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Equal("esami", result.Instruction.CategoryName)
        Assert.Equal(New List(Of String) From {"ecg", "ecg+eco_doppler"}, result.Instruction.Options)
    End Sub

    <Fact>
    Public Sub ConfirmsMultiExamPath_WhenDisambiguationPicksCompositeSet()
        Dim bundle = TestBundleFactory.BuildMultiExamBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                ValueSetOps.CreateAttributoConcept("esami", ValueSetOps.ParseValueSetKey("ecg+eco_doppler"))
            }
        })
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg_echo", result.NextState.SelectedPath)
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
                Attr("specialità", "cardiologica")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
    Public Sub ProcessFromText_DoesNotAcquireAge_FromArticleUnaInBookingPhrase()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        TestBundleFactory.AddAgeVincoloResolution(bundle)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "vorrei prenotare una prima visita angiologica con ecodoppler"
        )
        Assert.Null(ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
    End Sub

    <Fact>
    Public Sub ProcessFromText_PreservesSixMonthsUnit_WhenPendingAge()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        TestBundleFactory.AddAgeVincoloResolution(bundle)
        Dim state = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "cardiologica prima"
        ).NextState
        Assert.NotNull(state.PendingConstraint)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "6 mesi")
        Dim ageConcept = result.NextState.AcquiredConcepts.FirstOrDefault(
            Function(c) c.Category = "fascia di età")
        Assert.NotNull(ageConcept)
        Assert.Equal("6", ValueSetOps.ScalarValue(ageConcept))
        Assert.Equal("months", ageConcept.Unit)
    End Sub

    <Fact>
    Public Sub Disambiguates_WithNone_WhenOptionalCategoryMissingOnShorterPath()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
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
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "nessuno")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima", result.NextState.SelectedPath)
        Assert.True(result.NextState.AcquiredConcepts.Any(
            Function(ac) ac.Category = "ECG" AndAlso ValueSetOps.IsMissingValueList(ValueSetOps.ValuesFromConcept(ac))))
    End Sub

    <Fact>
    Public Sub ParsesSiAsCanonicalToken_WhenPendingDisambiguation()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "si")
        Assert.Single(result.Parsed)
        Assert.Equal("ECG", result.Parsed(0).Category)
        Assert.Equal("ecg", ValueSetOps.ScalarValue(result.Parsed(0)))
    End Sub

    <Fact>
    Public Sub RestoresLostPending_WhenAnswerContextProvided()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        state.PendingConstraint = Nothing
        Dim answerContext = New DisambiguationAnswerContext With {
            .Signature = "ECG||ecg||optional_include",
            .CategoryName = "ECG",
            .Options = New List(Of String) From {"ecg", "none"},
            .ValueKind = CategoryTypes.ValueKindCanonicalToken
        }
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "si", answerContext)
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg", result.NextState.SelectedPath)
        Assert.Contains("ECG", result.NextState.ExactAttributoCategories)
    End Sub

    <Fact>
    Public Sub CoercesGrammarAlias_WhenPlanGrammarMapsNonCatalogToken()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        bundle.Ontology.DisambiguationPlan = New DisambiguationPlan With {
            .Messages = New List(Of DisambiguationMessage) From {
                New DisambiguationMessage With {
                    .Signature = "ECG||ecg||optional_include",
                    .CategoryName = "ECG",
                    .Style = "optional_include",
                    .AnswerGrammar = New CategoryGrammar With {
                        .Regex = "(?<affirmative>sì|si)",
                        .Mappings = New Dictionary(Of String, String) From {{"affirmative", "incluso ecg"}}
                    }
                }
            }
        }
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "sì")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg", result.NextState.SelectedPath)
        Assert.Contains("ECG", result.NextState.ExactAttributoCategories)
    End Sub

    <Fact>
    Public Sub ConfirmsAdultPath_WhenDisambiguationAnswerMatchesChoice()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica")
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
                Attr("specialità", "cardiologica")
            }
        })
        Assert.Equal("canonical_token", result.Instruction.ExpectedConstraints(0).ValueKind)
        Assert.Equal("target", result.Instruction.ExpectedConstraints(0).CategoryName)
        Assert.Equal(New List(Of String) From {"adulto", "pediatrica"}, result.Instruction.ExpectedConstraints(0).AllowedTokens)
    End Sub

    <Fact>
    Public Sub ConfirmsFullDistrettiSet_WhenUtteranceMentionsAllTokens()
        Dim bundle = TestBundleFactory.BuildDistrettiAnatomiciBundle()
        Dim disambiguateResult = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("esame", "ecodoppler")
            }
        })
        Assert.Equal("disambiguate", disambiguateResult.Instruction.Action)
        Assert.Equal("distretti anatomici", disambiguateResult.Instruction.CategoryName)

        Dim utterance = "quello più completo con aorta arti inferiori e vasi epiaortici"
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, disambiguateResult.NextState, utterance)
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("ecodoppler.aorta_arti_epi", result.NextState.SelectedPath)
        Dim distretti = result.NextState.AcquiredConcepts.First(
            Function(c) c.Category = "distretti anatomici")
        Assert.Equal("aorta+arti inferiori+vasi epiaortici", ValueSetOps.ValueSetKey(ValueSetOps.ValuesFromConcept(distretti)))
    End Sub

    <Fact>
    Public Sub RedisambiguatesDistretti_WhenOnlyPartialSetAcquired()
        Dim bundle = TestBundleFactory.BuildDistrettiAnatomiciBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("esame", "ecodoppler"),
                AttrMulti("distretti anatomici", "arti inferiori")
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Equal("distretti anatomici", result.Instruction.CategoryName)
        Assert.Contains("aorta+arti inferiori+vasi epiaortici", result.Instruction.Options)
    End Sub

    <Fact>
    Public Sub ConfirmsVenosoOnly_WhenVenosoAlreadyAcquiredImplicitly()
        Dim bundle = TestBundleFactory.BuildVarieVenosoBundle()
        Dim step1 = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("esame", "ecodoppler"),
                AttrMulti("distretti anatomici", "aorta", "arti inferiori", "vasi epiaortici"),
                Attr("varie", "venoso")
            }
        })
        Assert.Equal("disambiguate", step1.Instruction.Action)
        Assert.Equal("varie", step1.Instruction.CategoryName)

        Dim step2 = AgentTurnEngine.ProcessAgentTurnFromText(bundle, step1.NextState, "venoso")
        Assert.Equal("confirm", step2.Instruction.Action)
        Assert.Equal("ecodoppler.venoso", step2.NextState.SelectedPath)
        Assert.Contains("varie", step2.NextState.ExactAttributoCategories)
    End Sub

    <Fact>
    Public Sub ConfirmsVenosoOnly_WhenUserAnswersVenosoAtDisambiguation()
        Dim bundle = TestBundleFactory.BuildVarieVenosoBundle()
        Dim distrettiFull = New List(Of Concept) From {
            Attr("esame", "ecodoppler"),
            AttrMulti("distretti anatomici", "aorta", "arti inferiori", "vasi epiaortici")
        }
        Dim disambiguateResult = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = distrettiFull
        })
        Assert.Equal("disambiguate", disambiguateResult.Instruction.Action)
        Assert.Equal("varie", disambiguateResult.Instruction.CategoryName)
        Assert.Contains("venoso", disambiguateResult.Instruction.Options)
        Assert.Contains("arterioso+venoso", disambiguateResult.Instruction.Options)

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, disambiguateResult.NextState, "venoso")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("ecodoppler.venoso", result.NextState.SelectedPath)
        Dim varie = result.NextState.AcquiredConcepts.First(Function(c) c.Category = "varie")
        Assert.Equal("venoso", ValueSetOps.ValueSetKey(ValueSetOps.ValuesFromConcept(varie)))
    End Sub

    <Fact>
    Public Sub ConfirmsViaCrossSlot_WhenPendingDisambiguationAnsweredWithOtherCategory()
        Dim bundle = TestBundleFactory.BuildChirurgicaCrossSlotBundle()
        TestBundleFactory.AddChirurgicaCrossSlotGrammars(bundle)

        Dim state = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "visita chirurgica"
        ).NextState

        Assert.NotNull(state.PendingConstraint)
        Assert.Equal("sottospecialità", state.PendingConstraint.CategoryName)

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "di controllo")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("chirurgica.generale.controllo", result.NextState.SelectedPath)
        Assert.Contains("controllo", result.SpokenHint.ToLowerInvariant())
    End Sub

    <Fact>
    Public Sub HttpResponse_BuildsWebhookPayload()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim turn = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica")
            }
        })
        Dim http = HttpResponseBuilder.BuildAgentDialogStepHttpResponse("conv-1", "doc-1", turn)
        Assert.True(http.Ok)
        Assert.Equal("disambiguate", http.Instruction.Action)
        Assert.False(String.IsNullOrEmpty(http.SpokenHint))
        Assert.Contains("DISAMBIGUATE", http.Debug.Log)
    End Sub

    Private Shared Function Attr(category As String, value As String) As Concept
        Return ValueSetOps.CreateAttributoConcept(category, New List(Of String) From {value})
    End Function

    Private Shared Function AttrMulti(category As String, ParamArray values() As String) As Concept
        Return ValueSetOps.CreateAttributoConcept(category, values)
    End Function

    Private Shared Function Vincolo(category As String, value As String) As Concept
        Return ValueSetOps.CreateVincoloConcept(category, value, "years")
    End Function

End Class
