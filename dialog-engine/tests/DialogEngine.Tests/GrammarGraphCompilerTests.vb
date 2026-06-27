''' <summary>
''' Unit tests for grammar graph compilation and answer matching.
''' </summary>
Imports DialogEngine.GrammarGraphModels
Imports Xunit

Public Class GrammarGraphCompilerTests

    <Fact>
    Public Sub CompileSingleSemanticValue_MatchesSynonymsOnNode()
        Dim valueId = "v-ecg"
        Dim graph = New GrammarGraph With {
            .Id = "g1",
            .Name = "test",
            .SemanticSets = New List(Of SemanticSet) From {
                New SemanticSet With {
                    .Id = "set1",
                    .Name = "options",
                    .Values = New List(Of SemanticValue) From {
                        New SemanticValue With {
                            .Id = valueId,
                            .Value = "ecg",
                            .Synonyms = New List(Of String) From {"elettrocardiogramma"}
                        }
                    }
                }
            },
            .Nodes = New List(Of GrammarGraphNode) From {
                New GrammarGraphNode With {
                    .Id = "n1",
                    .Label = "ecg",
                    .Synonyms = New List(Of String) From {"eco cardiaco"},
                    .Bindings = New List(Of NodeBinding) From {
                        New NodeBinding With {.Type = "semantic-value", .ValueId = valueId}
                    }
                }
            },
            .Edges = New List(Of GrammarGraphEdge)()
        }

        Dim compiled = GrammarGraphCompiler.CompileToCategoryGrammar(graph)
        Assert.Contains("eco cardiaco", compiled.Regex)
        Assert.Contains("elettrocardiogramma", compiled.Regex)

        Dim match = AnswerGrammarMatch.MatchCategoryGrammar(
            "vorrei eco cardiaco",
            New Models.CategoryGrammar With {.Regex = compiled.Regex, .Mappings = compiled.Mappings})
        Assert.Equal("ecg", match.MatchedOption)
    End Sub

    <Fact>
    Public Sub CompileAlternativeValueNodes_MatchesExpectedOption()
        Dim graph = BuildTwoOptionGraph()
        Dim compiled = GrammarGraphCompiler.CompileToCategoryGrammar(graph)

        Dim yes = AnswerGrammarMatch.MatchCategoryGrammar(
            "sì",
            New Models.CategoryGrammar With {.Regex = compiled.Regex, .Mappings = compiled.Mappings})
        Dim no = AnswerGrammarMatch.MatchCategoryGrammar(
            "no grazie",
            New Models.CategoryGrammar With {.Regex = compiled.Regex, .Mappings = compiled.Mappings})

        Assert.Equal("ecg", yes.MatchedOption)
        Assert.Equal("none", no.MatchedOption)
    End Sub

    <Fact>
    Public Sub CompileSequentialPrefix_SharedLanguage()
        Dim graph = BuildPrefixGraph()
        Dim compiled = GrammarGraphCompiler.CompileToCategoryGrammar(graph)

        Dim match = AnswerGrammarMatch.MatchCategoryGrammar(
            "vorrei ecg",
            New Models.CategoryGrammar With {.Regex = compiled.Regex, .Mappings = compiled.Mappings})
        Assert.Equal("ecg", match.MatchedOption)
    End Sub

    Private Shared Function BuildTwoOptionGraph() As GrammarGraph
        Dim ecgId = "v-ecg"
        Dim noneId = "v-none"
        Return New GrammarGraph With {
            .Id = "g2",
            .Name = "two-option",
            .SemanticSets = New List(Of SemanticSet) From {
                New SemanticSet With {
                    .Id = "set1",
                    .Name = "options",
                    .Values = New List(Of SemanticValue) From {
                        New SemanticValue With {.Id = ecgId, .Value = "ecg", .Synonyms = New List(Of String) From {"sì", "si"}},
                        New SemanticValue With {.Id = noneId, .Value = "none", .Synonyms = New List(Of String) From {"no", "niente"}}
                    }
                }
            },
            .Nodes = New List(Of GrammarGraphNode) From {
                New GrammarGraphNode With {
                    .Id = "n-ecg",
                    .Label = "ecg",
                    .Bindings = New List(Of NodeBinding) From {
                        New NodeBinding With {.Type = "semantic-value", .ValueId = ecgId}
                    }
                },
                New GrammarGraphNode With {
                    .Id = "n-none",
                    .Label = "none",
                    .Bindings = New List(Of NodeBinding) From {
                        New NodeBinding With {.Type = "semantic-value", .ValueId = noneId}
                    }
                }
            },
            .Edges = New List(Of GrammarGraphEdge)()
        }
    End Function

    Private Shared Function BuildPrefixGraph() As GrammarGraph
        Dim ecgId = "v-ecg"
        Return New GrammarGraph With {
            .Id = "g3",
            .Name = "prefix",
            .SemanticSets = New List(Of SemanticSet) From {
                New SemanticSet With {
                    .Id = "set1",
                    .Name = "options",
                    .Values = New List(Of SemanticValue) From {
                        New SemanticValue With {.Id = ecgId, .Value = "ecg", .Synonyms = New List(Of String) From {"ecg"}}
                    }
                }
            },
            .Nodes = New List(Of GrammarGraphNode) From {
                New GrammarGraphNode With {
                    .Id = "n-prefix",
                    .Label = "vorrei",
                    .Synonyms = New List(Of String) From {"voglio"}
                },
                New GrammarGraphNode With {
                    .Id = "n-ecg",
                    .Label = "ecg",
                    .Bindings = New List(Of NodeBinding) From {
                        New NodeBinding With {.Type = "semantic-value", .ValueId = ecgId}
                    }
                }
            },
            .Edges = New List(Of GrammarGraphEdge) From {
                New GrammarGraphEdge With {.Id = "e1", .Source = "n-prefix", .Target = "n-ecg", .Type = "sequential"}
            }
        }
    End Function

End Class
