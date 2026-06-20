''' <summary>
''' Builds test AgentBundle fixtures with Ontology + Catalog structure.
''' </summary>
Imports DialogEngine.Models

Public Module TestBundleFactory

    Public Function BuildCardioBundle() As AgentBundle
        Dim adultPath = "cardiologica.prima.adulto"
        Dim pediatricPath = "cardiologica.prima.pediatrica"

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Cardio"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .ConfirmationPreamble = "Confermo:",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "specialità", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"cardiologica"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "tipo visita", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"prima"}},
                    New CategoryDefinition With {.Id = "c3", .Name = "target", .Order = 2, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"adulto", "pediatrica"}},
                    New CategoryDefinition With {.Id = "c4", .Name = "fascia di età", .Order = 3, .Kind = ConceptKind.Vincolo, .ValueKind = "age_years", .AllowedValues = New List(Of String) From {"> 17 anni", "da 6 anni a 15 anni"}}
                },
                .Nodes = New List(Of DialogNode) From {
                    New DialogNode With {.Path = adultPath, .ConfirmationText = "Visita cardiologica adulta"},
                    New DialogNode With {.Path = pediatricPath, .ConfirmationText = "Visita cardiologica pediatrica"}
                }
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(adultPath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita"),
                        Attr("adulto", "target"),
                        Vincolo("> 17 anni", "fascia di età")
                    }, minAge:=18, maxAge:=Nothing),
                    BuildCatalogItem(pediatricPath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita"),
                        Attr("pediatrica", "target"),
                        Vincolo("da 6 anni a 15 anni", "fascia di età")
                    }, minAge:=6, maxAge:=15)
                }
            }
        }
    End Function

    Public Function BuildTargetOnlyBundle() As AgentBundle
        Dim adultPath = "cardiologica.adulto"
        Dim pediatricPath = "cardiologica.pediatrica"

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Cardio target"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "specialità", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"cardiologica"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "target", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"adulto", "pediatrica"}}
                },
                .Nodes = New List(Of DialogNode)()
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(adultPath, {Attr("cardiologica", "specialità"), Attr("adulto", "target")}),
                    BuildCatalogItem(pediatricPath, {Attr("cardiologica", "specialità"), Attr("pediatrica", "target")})
                }
            }
        }
    End Function

    Public Function BuildOptionalEcgBundle() As AgentBundle
        Dim basePath = "cardiologica.prima"
        Dim ecgPath = "cardiologica.prima.ecg"

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Cardio ECG"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .ConfirmationPreamble = "Confermo:",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "specialità", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"cardiologica"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "tipo visita", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"prima"}},
                    New CategoryDefinition With {.Id = "c3", .Name = "ECG", .Order = 2, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"ecg", "none"}}
                },
                .Nodes = New List(Of DialogNode) From {
                    New DialogNode With {.Path = basePath, .ConfirmationText = "Visita cardiologica prima"},
                    New DialogNode With {.Path = ecgPath, .ConfirmationText = "Visita cardiologica prima con ECG"}
                },
                .DisambiguationPlan = BuildOptionalEcgDisambiguationPlan()
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(basePath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita")
                    }),
                    BuildCatalogItem(ecgPath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita"),
                        Attr("ecg", "ECG")
                    })
                }
            }
        }
    End Function

    Private Function BuildOptionalEcgDisambiguationPlan() As DisambiguationPlan
        Return New DisambiguationPlan With {
            .Messages = New List(Of DisambiguationMessage) From {
                New DisambiguationMessage With {
                    .Signature = "ECG||ecg||optional_include",
                    .CategoryName = "ECG",
                    .Style = "optional_include",
                    .Question = "Desidera includere l'ECG?",
                    .AnswerGrammar = New CategoryGrammar With {
                        .Regex = "(?<affirmative>sì|si)|(?<decline>no|niente|nessuno)|(?<literal>ecg|none)",
                        .Mappings = New Dictionary(Of String, String) From {
                            {"affirmative", "ecg"},
                            {"decline", "none"},
                            {"literal", "ecg"}
                        }
                    }
                }
            }
        }
    End Function

    Public Function BuildMultiExamBundle() As AgentBundle
        Dim ecgOnlyPath = "cardiologica.prima.ecg_only"
        Dim ecgEchoPath = "cardiologica.prima.ecg_echo"

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Cardio esami"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "specialità", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"cardiologica"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "tipo visita", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"prima"}},
                    New CategoryDefinition With {.Id = "c3", .Name = "esami", .Order = 2, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"ecg", "eco_doppler"}}
                },
                .Nodes = New List(Of DialogNode)()
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(ecgOnlyPath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita"),
                        AttrMulti("esami", "ecg")
                    }),
                    BuildCatalogItem(ecgEchoPath, {
                        Attr("cardiologica", "specialità"),
                        Attr("prima", "tipo visita"),
                        AttrMulti("esami", "ecg", "eco_doppler")
                    })
                }
            }
        }
    End Function

    Public Function BuildDistrettiAnatomiciBundle() As AgentBundle
        Dim artiOnlyPath = "ecodoppler.arti_inferiori"
        Dim aortaArtiPath = "ecodoppler.aorta_arti"
        Dim fullPath = "ecodoppler.aorta_arti_epi"

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Eco distretti"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "esame", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"ecodoppler"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "distretti anatomici", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"arti inferiori", "aorta", "vasi epiaortici"}}
                },
                .Nodes = New List(Of DialogNode) From {
                    New DialogNode With {.Path = fullPath, .ConfirmationText = "Eco completa"},
                    New DialogNode With {.Path = aortaArtiPath, .ConfirmationText = "Eco aorta e arti"},
                    New DialogNode With {.Path = artiOnlyPath, .ConfirmationText = "Eco arti inferiori"}
                }
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(artiOnlyPath, {
                        Attr("ecodoppler", "esame"),
                        AttrMulti("distretti anatomici", "arti inferiori")
                    }),
                    BuildCatalogItem(aortaArtiPath, {
                        Attr("ecodoppler", "esame"),
                        AttrMulti("distretti anatomici", "aorta", "arti inferiori")
                    }),
                    BuildCatalogItem(fullPath, {
                        Attr("ecodoppler", "esame"),
                        AttrMulti("distretti anatomici", "aorta", "arti inferiori", "vasi epiaortici")
                    })
                }
            }
        }
    End Function

    Public Function BuildVarieVenosoBundle() As AgentBundle
        Dim venosoOnlyPath = "ecodoppler.venoso"
        Dim bothPath = "ecodoppler.arterioso_venoso"
        Dim distrettiFull = New List(Of String) From {"aorta", "arti inferiori", "vasi epiaortici"}

        Return New AgentBundle With {
            .Meta = New AgentBundleMeta With {.DocumentName = "Eco varie"},
            .Ontology = New Ontology With {
                .StartQuestion = "Come posso aiutarla?",
                .Categories = New List(Of CategoryDefinition) From {
                    New CategoryDefinition With {.Id = "c1", .Name = "esame", .Order = 0, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"ecodoppler"}},
                    New CategoryDefinition With {.Id = "c2", .Name = "distretti anatomici", .Order = 1, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"aorta", "arti inferiori", "vasi epiaortici"}},
                    New CategoryDefinition With {.Id = "c3", .Name = "varie", .Order = 2, .Kind = ConceptKind.Attributo, .AllowedValues = New List(Of String) From {"venoso", "arterioso"}}
                },
                .Nodes = New List(Of DialogNode) From {
                    New DialogNode With {.Path = venosoOnlyPath, .ConfirmationText = "Eco venoso"},
                    New DialogNode With {.Path = bothPath, .ConfirmationText = "Eco arterioso e venoso"}
                }
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(venosoOnlyPath, {
                        Attr("ecodoppler", "esame"),
                        AttrMulti("distretti anatomici", distrettiFull.ToArray()),
                        Attr("venoso", "varie")
                    }),
                    BuildCatalogItem(bothPath, {
                        Attr("ecodoppler", "esame"),
                        AttrMulti("distretti anatomici", distrettiFull.ToArray()),
                        AttrMulti("varie", "arterioso", "venoso")
                    })
                }
            }
        }
    End Function

    Public Sub AddSpecialitaGrammar(bundle As AgentBundle)
        Dim category = bundle.Ontology.Categories.FirstOrDefault(Function(c) c.Name = "specialità")
        If category Is Nothing Then Return
        category.Grammar = New Models.CategoryGrammar With {
            .Regex = "(?<cardiologica>cardiologica|visita cardiologica)",
            .Mappings = New Dictionary(Of String, String) From {{"cardiologica", "cardiologica"}}
        }
    End Sub

    Public Sub AddAgeVincoloResolution(bundle As AgentBundle)
        Dim category = bundle.Ontology.Categories.FirstOrDefault(
            Function(c) c.Name.ToLowerInvariant().Contains("fascia") AndAlso c.Name.ToLowerInvariant().Contains("et"))
        If category Is Nothing Then Return
        category.ValueKind = "age_years"
        category.Resolution = BuildAgeVincoloResolutionPipeline()
        category.Grammar = Nothing
    End Sub

    ''' <summary>Legacy alias — prefer AddAgeVincoloResolution.</summary>
    Public Sub AddAgeVincoloGrammar(bundle As AgentBundle)
        AddAgeVincoloResolution(bundle)
    End Sub

    ''' <summary>Pipeline v1 matching compileAgeVincoloResolutionPipeline() in TypeScript.</summary>
    Public Function BuildAgeVincoloResolutionPipeline() As Models.ResolutionPipeline
        Return AgeVincoloPipelineFactory.BuildPipeline()
    End Function

    Private Function Attr(value As String, category As String) As Concept
        Return ValueSetOps.CreateAttributoConcept(category, New List(Of String) From {value})
    End Function

    Private Function AttrMulti(category As String, ParamArray values() As String) As Concept
        Return ValueSetOps.CreateAttributoConcept(category, values)
    End Function

    Private Function Vincolo(value As String, category As String) As Concept
        Return ValueSetOps.CreateVincoloConcept(category, value)
    End Function

    Private Function BuildCatalogItem(
        path As String,
        concepts As Concept(),
        Optional minAge As Integer? = Nothing,
        Optional maxAge As Integer? = Nothing
    ) As CatalogItem
        Dim ageConstraints As New List(Of AgeConstraint)()
        If minAge.HasValue OrElse maxAge.HasValue Then
            ageConstraints.Add(New AgeConstraint With {
                .CategoryName = "fascia di età",
                .Min = minAge,
                .Max = maxAge
            })
        End If

        Return New CatalogItem With {
            .Path = path,
            .Concepts = concepts.ToList(),
            .AgeConstraints = ageConstraints
        }
    End Function

End Module
