''' <summary>
''' Category type helpers and ontology lookup.
''' </summary>
Public Module CategoryTypes

    Public Const ValueKindAgeYears As String = "age_years"

    Public Function IsAgeYearsCategory(category As Models.CategoryDefinition) As Boolean
        Return category IsNot Nothing AndAlso
               (category.Kind = Models.ConceptKind.Vincolo) AndAlso
               String.Equals(category.ValueKind, ValueKindAgeYears, StringComparison.OrdinalIgnoreCase)
    End Function

    Public Function FindCategoryByName(
        ontology As Models.Ontology,
        categoryName As String
    ) As Models.CategoryDefinition
        If ontology Is Nothing OrElse ontology.Categories Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then
            Return Nothing
        End If
        Dim trimmed = categoryName.Trim()
        Return ontology.Categories.FirstOrDefault(
            Function(c) String.Equals(c.Name, trimmed, StringComparison.Ordinal))
    End Function

    Public Function FirstAgeVincoloCategory(ontology As Models.Ontology) As Models.CategoryDefinition
        If ontology Is Nothing OrElse ontology.Categories Is Nothing Then Return Nothing
        Return ontology.Categories.FirstOrDefault(AddressOf IsAgeYearsCategory)
    End Function

End Module
