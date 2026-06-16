''' <summary>
''' Converts age quantities with unit to catalog age_years for min/max filtering.
''' </summary>
Public Module AgeUnitConverter

    Public Function ToYears(quantity As Models.ResolvedQuantity) As Integer?
        If quantity Is Nothing Then Return Nothing
        Return ToYears(quantity.Value, quantity.Unit)
    End Function

    Public Function ToYears(value As Integer, unit As String) As Integer?
        If value < 0 Then Return Nothing
        Dim u = If(unit, String.Empty).Trim().ToLowerInvariant()
        Select Case u
            Case "years", "year", "anni", "anno", ""
                Return value
            Case "months", "month", "mesi", "mese"
                Return value \ 12
            Case "weeks", "week", "settimane", "settimana"
                Return value \ 52
            Case "days", "day", "giorni", "giorno"
                Return value \ 365
            Case Else
                Return Nothing
        End Select
    End Function

    Public Function ParseUnitToken(token As String) As String
        Dim t = If(token, String.Empty).Trim().ToLowerInvariant()
        Select Case t
            Case "anno", "anni", "years", "year" : Return "years"
            Case "mese", "mesi", "months", "month" : Return "months"
            Case "settimana", "settimane", "weeks", "week" : Return "weeks"
            Case "giorno", "giorni", "days", "day" : Return "days"
            Case Else : Return t
        End Select
    End Function

End Module
