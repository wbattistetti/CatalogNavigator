''' <summary>
''' Disambiguation helpers and ConvAI concept validation against prior candidates.
''' </summary>
Imports System.Globalization

Public Module AgentSlotMatch

    Public Class InferredDisambiguation
        Public Property CategoryName As String
        Public Property Options As List(Of String) = New List(Of String)()
    End Class

    Public Class InferredConcept
        Public Property CategoryName As String
        Public Property Value As String
    End Class

    Private Class CategoryDistinctValues
        Public Property CategoryName As String
        Public Property Kind As String
        Public Property Options As List(Of String) = New List(Of String)()
    End Class

    Private Function ConceptMatchesCatalogConcept(
        catalogConcept As Models.Concept,
        categoryKey As String,
        conceptValue As String
    ) As Boolean
        Return CategoryNormalization.NormalizeCategoryKey(catalogConcept.Category) = categoryKey AndAlso
               CategoryNormalization.NormalizeConceptValue(catalogConcept.Value) =
               CategoryNormalization.NormalizeConceptValue(conceptValue)
    End Function

    Public Function ShouldAskAge(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        conversation As Models.AgentSessionState
    ) As Boolean
        If ConceptOps.FindAcquiredAgeYears(AcquiredList(conversation)).HasValue Then Return False
        If candidatePaths.Count <= 1 Then Return False

        Dim catalogMap = BundleAccess.CatalogByPath(bundle)
        If AnyPathHasAgeConstraint(candidatePaths, catalogMap) Then
            Return candidatePaths.Count > 1
        End If

        Return HasUnresolvedAgeVincoloAmongCandidates(bundle, candidatePaths, AcquiredList(conversation))
    End Function

    Public Function AnyPathHasAgeConstraint(
        paths As IList(Of String),
        catalogMap As Dictionary(Of String, Models.CatalogItem)
    ) As Boolean
        Return paths.Any(Function(path)
                             If Not catalogMap.TryGetValue(path, Nothing) Then Return False
                             Return catalogMap(path).AgeConstraints IsNot Nothing AndAlso catalogMap(path).AgeConstraints.Count > 0
                         End Function)
    End Function

    Private Function CollectCategoryDistinctValues(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        acquired As IList(Of Models.Concept),
        catalogMap As Dictionary(Of String, Models.CatalogItem)
    ) As List(Of CategoryDistinctValues)
        Dim acquiredKeys = ConceptOps.AcquiredCategoryKeys(acquired)
        Dim categories = CategoryNormalization.NormalizeCategoryOrders(bundle.Ontology.Categories).
            Where(Function(c) c.AllowedValues IsNot Nothing AndAlso c.AllowedValues.Count > 0).
            ToList()

        Dim results As New List(Of CategoryDistinctValues)()

        For Each category In categories
            Dim key = CategoryNormalization.NormalizeCategoryKey(category.Name)
            If acquiredKeys.Contains(key) Then Continue For

            Dim values As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
            For Each path In candidatePaths
                If Not catalogMap.TryGetValue(path, Nothing) Then Continue For
                Dim concept = catalogMap(path).Concepts.FirstOrDefault(
                    Function(c) CategoryNormalization.NormalizeCategoryKey(c.Category) = key
                )
                If concept IsNot Nothing AndAlso Not String.IsNullOrEmpty(concept.Value) Then
                    values.Add(concept.Value)
                End If
            Next

            If values.Count = 0 Then Continue For

            results.Add(New CategoryDistinctValues With {
                .CategoryName = category.Name,
                .Kind = If(category.Kind = "vincolo", "vincolo", "attributo"),
                .Options = values.OrderBy(Function(v) v, StringComparer.Create(New CultureInfo("it-IT"), False)).ToList()
            })
        Next

        Return results
    End Function

    Public Function HasUnresolvedAgeVincoloAmongCandidates(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        acquired As IList(Of Models.Concept)
    ) As Boolean
        Dim catalogMap = BundleAccess.CatalogByPath(bundle)
        Dim distinct = CollectCategoryDistinctValues(bundle, candidatePaths, acquired, catalogMap)
        Return distinct.Any(Function(entry) entry.Kind = "vincolo" AndAlso entry.Options.Count > 0)
    End Function

    Public Function FindDisambiguationTarget(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        acquired As IList(Of Models.Concept)
    ) As InferredDisambiguation
        Dim catalogMap = BundleAccess.CatalogByPath(bundle)
        Dim distinct = CollectCategoryDistinctValues(bundle, candidatePaths, acquired, catalogMap)
        Dim target = distinct.FirstOrDefault(Function(entry) entry.Kind = "attributo" AndAlso entry.Options.Count >= 2)
        If target Is Nothing Then Return Nothing

        Return New InferredDisambiguation With {
            .CategoryName = target.CategoryName,
            .Options = target.Options
        }
    End Function

    Public Function FindInferredConcept(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        acquired As IList(Of Models.Concept)
    ) As InferredConcept
        Dim catalogMap = BundleAccess.CatalogByPath(bundle)
        Dim distinct = CollectCategoryDistinctValues(bundle, candidatePaths, acquired, catalogMap)

        For Each entry In distinct
            If entry.Kind <> "attributo" OrElse entry.Options.Count <> 1 Then Continue For
            Return New InferredConcept With {
                .CategoryName = entry.CategoryName,
                .Value = entry.Options(0)
            }
        Next
        Return Nothing
    End Function

    Public Function ConceptMatchesCorpusOnPaths(
        bundle As Models.AgentBundle,
        candidatePaths As IList(Of String),
        concept As Models.Concept
    ) As Boolean
        Dim categoryKey = CategoryNormalization.NormalizeCategoryKey(concept.Category)
        Dim catalogMap = BundleAccess.CatalogByPath(bundle)

        For Each path In candidatePaths
            If Not catalogMap.TryGetValue(path, Nothing) Then Continue For
            Dim hasMatch = catalogMap(path).Concepts.Any(
                Function(c) BundleAccess.IsAttributoConcept(c) AndAlso ConceptMatchesCatalogConcept(c, categoryKey, concept.Value)
            )
            If hasMatch Then Return True
        Next
        Return False
    End Function

    Public Function PriorCandidatePaths(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState
    ) As List(Of String)
        Return CatalogFilter.FilterCandidates(bundle.Catalog, conversation).
            Select(Function(item) item.Path).
            ToList()
    End Function

    Private Function AcquiredList(conversation As Models.AgentSessionState) As IList(Of Models.Concept)
        If conversation Is Nothing OrElse conversation.AcquiredConcepts Is Nothing Then
            Return New List(Of Models.Concept)()
        End If
        Return conversation.AcquiredConcepts
    End Function

End Module
