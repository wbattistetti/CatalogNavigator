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
                        ("cardiologica", "specialità", ConceptKind.Attributo),
                        ("prima", "tipo visita", ConceptKind.Attributo),
                        ("adulto", "target", ConceptKind.Attributo),
                        ("> 17 anni", "fascia di età", ConceptKind.Vincolo)
                    }, minAge:=18, maxAge:=Nothing),
                    BuildCatalogItem(pediatricPath, {
                        ("cardiologica", "specialità", ConceptKind.Attributo),
                        ("prima", "tipo visita", ConceptKind.Attributo),
                        ("pediatrica", "target", ConceptKind.Attributo),
                        ("da 6 anni a 15 anni", "fascia di età", ConceptKind.Vincolo)
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
                    BuildCatalogItem(adultPath, {("cardiologica", "specialità", ConceptKind.Attributo), ("adulto", "target", ConceptKind.Attributo)}),
                    BuildCatalogItem(pediatricPath, {("cardiologica", "specialità", ConceptKind.Attributo), ("pediatrica", "target", ConceptKind.Attributo)})
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
                }
            },
            .Catalog = New Catalog With {
                .Items = New List(Of CatalogItem) From {
                    BuildCatalogItem(basePath, {
                        ("cardiologica", "specialità", ConceptKind.Attributo),
                        ("prima", "tipo visita", ConceptKind.Attributo)
                    }),
                    BuildCatalogItem(ecgPath, {
                        ("cardiologica", "specialità", ConceptKind.Attributo),
                        ("prima", "tipo visita", ConceptKind.Attributo),
                        ("ecg", "ECG", ConceptKind.Attributo)
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

    Private Function BuildCatalogItem(
        path As String,
        concepts As (Value As String, Category As String, Kind As ConceptKind)(),
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
            .Concepts = concepts.Select(
                Function(c) New Concept With {.Value = c.Value, .Category = c.Category, .Kind = c.Kind}
            ).ToList(),
            .AgeConstraints = ageConstraints
        }
    End Function

End Module
