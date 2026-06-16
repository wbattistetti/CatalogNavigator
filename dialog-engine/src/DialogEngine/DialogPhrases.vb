''' <summary>
''' Template-based spoken hints for disambiguation and confirmation.
''' </summary>
Public Module DialogPhrases

    Public Function FormatImplicitConceptConfirmHint(categoryName As String, token As String) As String
        Dim cat = categoryName.Trim().ToLowerInvariant()
        Dim t = token.Trim().ToLowerInvariant()

        If cat.Contains("tipo") AndAlso cat.Contains("visita") Then
            If t = "prima" Then Return "È una prima visita?"
            If t = "controllo" Then Return "È una visita di controllo?"
        End If

        Return $"Per {categoryName}, si tratta di «{token}»?"
    End Function

    Public Function BuildAttributeSpokenHint(categoryName As String, options As IList(Of String)) As String
        If options Is Nothing OrElse options.Count = 0 Then
            Return $"Può specificare {categoryName}?"
        End If
        If options.Count = 2 Then
            Return $"Per {categoryName}, preferisce {options(0)} o {options(1)}?"
        End If
        Dim listed = String.Join(", ", options.Take(options.Count - 1))
        Return $"Per {categoryName}, preferisce {listed} o {options(options.Count - 1)}?"
    End Function

    Public Function FormatIncompatibleCombination(concepts As IList(Of Models.Concept)) As String
        If concepts Is Nothing OrElse concepts.Count = 0 Then
            Return "Non esiste una prestazione con le caratteristiche indicate."
        End If

        Dim last = concepts(concepts.Count - 1)
        Dim value = If(last?.Value, "quella indicata").Trim()
        Return $"Non esiste una prestazione che includa «{value}» con le altre caratteristiche indicate."
    End Function

    Public Function FormatLeafConfirmation(targetPath As String, node As Models.DialogNode, preamble As String) As String
        Dim text = node?.ConfirmationText?.Trim()
        If Not String.IsNullOrEmpty(text) Then
            Dim pre = If(String.IsNullOrWhiteSpace(preamble), "Quindi confermo:", preamble.Trim())
            Return $"{pre} {text}"
        End If
        Return $"Selezionato: {targetPath}"
    End Function

    Public Function DefaultNoMatchReplies(question As String) As (NoMatch1 As String, NoMatch2 As String, NoMatch3 As String)
        Dim hint = question?.Trim().TrimEnd("?"c).Trim()
        Dim suffix = If(String.IsNullOrEmpty(hint), "", $" {hint}?")
        Return (
            $"Non ho capito.{If(String.IsNullOrEmpty(suffix), " Può ripetere?", suffix)}",
            $"Mi scusi, non ho capito bene. Può ripetere?{suffix}",
            "Non riesco a capire. Può formulare la risposta in altro modo?"
        )
    End Function

End Module
