''' <summary>

''' Read-only accessors for AgentBundle catalog and ontology.

''' </summary>

Public Module BundleAccess



    Public Function ItemPaths(bundle As Models.AgentBundle) As List(Of String)

        If bundle Is Nothing OrElse bundle.Catalog Is Nothing OrElse bundle.Catalog.Items Is Nothing Then

            Return New List(Of String)()

        End If

        Return bundle.Catalog.Items.Select(Function(item) item.Path).ToList()

    End Function



    Public Function FindDialogNode(bundle As Models.AgentBundle, path As String) As Models.DialogNode

        If bundle Is Nothing OrElse bundle.Ontology Is Nothing OrElse bundle.Ontology.Nodes Is Nothing Then

            Return Nothing

        End If

        Return bundle.Ontology.Nodes.FirstOrDefault(Function(node) node.Path = path)

    End Function



End Module

