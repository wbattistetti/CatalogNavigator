''' <summary>
''' Normalization and comparison for multi-value concept sets (category → values[]).
''' </summary>
Imports System.Globalization

Public Module ValueSetOps

    Public Const ValueSetSeparator As String = "+"

    Public Function NormalizeAttributoValues(values As IEnumerable(Of String)) As List(Of String)
        Dim trimmed As New List(Of String)()
        If values Is Nothing Then Return trimmed
        For Each raw In values
            If raw Is Nothing Then Continue For
            Dim text = raw.Trim()
            If text.Length > 0 Then trimmed.Add(text)
        Next

        If trimmed.Count = 1 AndAlso CategoryTypes.IsMissingCategoryValue(trimmed(0)) Then
            Return New List(Of String) From {CategoryTypes.MissingCategoryValue}
        End If

        Dim seen As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim result As New List(Of String)()

        For Each token In trimmed
            If CategoryTypes.IsMissingCategoryValue(token) Then Continue For
            If seen.Contains(token) Then Continue For
            seen.Add(token)
            result.Add(token)
        Next

        Return result.
            OrderBy(Function(v) v, StringComparer.Create(New CultureInfo("it-IT"), False)).
            ToList()
    End Function

    Public Function ValueSetKey(values As IEnumerable(Of String)) As String
        Dim norm = NormalizeAttributoValues(values)
        If norm.Count = 0 Then Return CategoryTypes.MissingCategoryValue
        If norm.Count = 1 Then Return norm(0)
        Return String.Join(ValueSetSeparator, norm)
    End Function

    Public Function ParseValueSetKey(key As String) As List(Of String)
        If String.IsNullOrWhiteSpace(key) OrElse CategoryTypes.IsMissingCategoryValue(key) Then
            Return New List(Of String)()
        End If

        Dim trimmed = key.Trim()
        If Not trimmed.Contains(ValueSetSeparator) Then
            Return New List(Of String) From {trimmed}
        End If

        Return NormalizeAttributoValues(trimmed.Split(ValueSetSeparator))
    End Function

    Public Function IsMissingValueSetKey(key As String) As Boolean
        Return String.IsNullOrWhiteSpace(key) OrElse CategoryTypes.IsMissingCategoryValue(key)
    End Function

    Public Function IsMissingValueList(values As IEnumerable(Of String)) As Boolean
        Dim norm = NormalizeAttributoValues(values)
        Return norm.Count = 0 OrElse
               (norm.Count = 1 AndAlso CategoryTypes.IsMissingCategoryValue(norm(0)))
    End Function

    Public Function ValueSetsEqual(
        left As IEnumerable(Of String),
        right As IEnumerable(Of String)
    ) As Boolean
        Return String.Equals(ValueSetKey(left), ValueSetKey(right), StringComparison.OrdinalIgnoreCase)
    End Function

    ''' <summary>True when item values contain every mentioned value (NLU subset match).</summary>
    Public Function ValueSetContainsAll(
        itemValues As IEnumerable(Of String),
        mentioned As IEnumerable(Of String)
    ) As Boolean
        Dim itemNorm = NormalizeAttributoValues(itemValues)
        Dim mentionedNorm = NormalizeAttributoValues(mentioned)

        If mentionedNorm.Count = 0 Then
            Return IsMissingValueList(itemNorm)
        End If

        Dim itemKeys As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        For Each value In itemNorm
            itemKeys.Add(value)
        Next

        Return mentionedNorm.All(Function(m) itemKeys.Contains(m))
    End Function

    Public Function FormatValueSetDisplay(key As String) As String
        Dim values = ParseValueSetKey(key)
        If values.Count = 0 Then Return CategoryTypes.MissingCategoryValue
        Return String.Join(" + ", values)
    End Function

    Public Function ValuesFromConcept(concept As Models.Concept) As List(Of String)
        If concept Is Nothing Then Return New List(Of String)()
        If concept.Values IsNot Nothing AndAlso concept.Values.Count > 0 Then
            Return NormalizeAttributoValues(concept.Values)
        End If
        Return New List(Of String)()
    End Function

    Public Function ScalarValue(concept As Models.Concept) As String
        Dim values = ValuesFromConcept(concept)
        If values.Count = 0 Then Return String.Empty
        Return values(0)
    End Function

    Public Function ItemAttributoValues(
        item As Models.CatalogItem,
        categoryName As String
    ) As List(Of String)
        Dim result As New List(Of String)()
        If item Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then Return result
        If item.Concepts Is Nothing Then Return result

        For Each concept In item.Concepts
            If concept Is Nothing Then Continue For
            If concept.Kind <> Models.ConceptKind.Attributo Then Continue For
            If Not String.Equals(concept.Category, categoryName, StringComparison.Ordinal) Then Continue For
            result.AddRange(ValuesFromConcept(concept))
        Next

        Return NormalizeAttributoValues(result)
    End Function

    Public Function ItemAttributoValueSetKey(
        item As Models.CatalogItem,
        categoryName As String
    ) As String
        Return ValueSetKey(ItemAttributoValues(item, categoryName))
    End Function

    Public Function FindItemAttributoConcept(
        item As Models.CatalogItem,
        categoryName As String
    ) As Models.Concept
        If item Is Nothing OrElse item.Concepts Is Nothing Then Return Nothing
        Return item.Concepts.FirstOrDefault(
            Function(c) c IsNot Nothing AndAlso
                        c.Kind = Models.ConceptKind.Attributo AndAlso
                        String.Equals(c.Category, categoryName, StringComparison.Ordinal))
    End Function

    Public Function CreateAttributoConcept(
        categoryName As String,
        values As IEnumerable(Of String)
    ) As Models.Concept
        Return New Models.Concept With {
            .Category = categoryName.Trim(),
            .Values = NormalizeAttributoValues(values),
            .Kind = Models.ConceptKind.Attributo
        }
    End Function

    Public Function CreateVincoloConcept(
        categoryName As String,
        value As String,
        Optional unit As String = Nothing
    ) As Models.Concept
        Dim trimmed = If(value, String.Empty).Trim()
        Return New Models.Concept With {
            .Category = categoryName.Trim(),
            .Values = If(String.IsNullOrWhiteSpace(trimmed),
                New List(Of String)(),
                New List(Of String) From {trimmed}),
            .Kind = Models.ConceptKind.Vincolo,
            .Unit = unit
        }
    End Function

    Public Function FormatConceptValues(concept As Models.Concept) As String
        If concept Is Nothing Then Return String.Empty
        Return ValueSetKey(ValuesFromConcept(concept))
    End Function

End Module
