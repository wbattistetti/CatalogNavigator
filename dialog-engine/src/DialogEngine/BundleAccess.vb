''' <summary>
''' Read-only accessors for AgentBundle catalog and ontology.
''' </summary>
Public Module BundleAccess

    Public Function ItemPaths(bundle As Models.AgentBundle) As List(Of String)
        If bundle?.Catalog?.Items Is Nothing Then Return New List(Of String)()
        Return bundle.Catalog.Items.Select(Function(item) item.Path).ToList()
    End Function

    Public Function CatalogByPath(bundle As Models.AgentBundle) As Dictionary(Of String, Models.CatalogItem)
        If bundle?.Catalog?.Items Is Nothing Then Return New Dictionary(Of String, Models.CatalogItem)()
        Return bundle.Catalog.Items.ToDictionary(Function(item) item.Path)
    End Function

    Public Function FindDialogNode(bundle As Models.AgentBundle, path As String) As Models.DialogNode
        Return bundle?.Ontology?.Nodes?.FirstOrDefault(Function(node) node.Path = path)
    End Function

    Public Function IsAttributoConcept(concept As Models.Concept) As Boolean
        Return concept IsNot Nothing AndAlso String.Equals(concept.Kind, "attributo", StringComparison.OrdinalIgnoreCase)
    End Function

    Public Function IsVincoloConcept(concept As Models.Concept) As Boolean
        Return concept IsNot Nothing AndAlso String.Equals(concept.Kind, "vincolo", StringComparison.OrdinalIgnoreCase)
    End Function

End Module
