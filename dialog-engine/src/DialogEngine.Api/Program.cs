/**

 * ASP.NET host for the VB DialogEngine library (sole runtime for agent turns).

 */

using System.Text.Json;

using System.Text.Json.Serialization;

using DialogEngine;

using DialogEngine.GrammarGraphModels;

using DialogEngine.Models;



var builder = WebApplication.CreateBuilder(args);



builder.WebHost.UseUrls(

    builder.Configuration["Urls"]

    ?? Environment.GetEnvironmentVariable("DIALOG_ENGINE_URLS")

    ?? "http://127.0.0.1:5190");



builder.Services.AddCors(options =>

{

    options.AddDefaultPolicy(policy => policy

        .SetIsOriginAllowed(origin =>

        {

            if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

            return uri.Host is "localhost" or "127.0.0.1";

        })

        .AllowAnyHeader()

        .AllowAnyMethod());

});



var app = builder.Build();

app.UseCors();



var jsonOptions = new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};
jsonOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));

static ConceptKind ParseConceptKind(string? kind)
{
    if (string.Equals(kind, "vincolo", StringComparison.OrdinalIgnoreCase))
        return ConceptKind.Vincolo;
    return ConceptKind.Attributo;
}

static List<string> ParseIncomingConceptValues(JsonElement item)
{
    if (item.TryGetProperty("values", out var valuesEl) && valuesEl.ValueKind == JsonValueKind.Array)
    {
        return valuesEl.EnumerateArray()
            .Select(v => v.GetString()?.Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v!)
            .ToList();
    }

    var value = item.TryGetProperty("value", out var valEl) ? valEl.GetString()?.Trim() : null;
    if (string.IsNullOrWhiteSpace(value)) return new List<string>();
    return ValueSetOps.ParseValueSetKey(value);
}

static List<string> ParseStringList(JsonElement parent, string propertyName)
{
    if (!parent.TryGetProperty(propertyName, out var el) || el.ValueKind != JsonValueKind.Array)
        return new List<string>();
    return el.EnumerateArray()
        .Select(v => v.GetString()?.Trim())
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v!)
        .ToList();
}

static DisambiguationAnswerContext? ParseAnswerContext(JsonElement root)
{
    if (!root.TryGetProperty("answerContext", out var ctxEl) || ctxEl.ValueKind != JsonValueKind.Object)
        return null;

    var categoryName = ctxEl.TryGetProperty("categoryName", out var catEl) ? catEl.GetString()?.Trim() : null;
    if (string.IsNullOrWhiteSpace(categoryName)) return null;

    var options = ParseStringList(ctxEl, "options");
    if (options.Count == 0) return null;

    var signature = ctxEl.TryGetProperty("signature", out var sigEl) ? sigEl.GetString()?.Trim() : null;
    var valueKind = ctxEl.TryGetProperty("valueKind", out var vkEl) ? vkEl.GetString()?.Trim() : null;

    return new DisambiguationAnswerContext
    {
        CategoryName = categoryName,
        Options = options,
        Signature = signature,
        ValueKind = valueKind,
    };
}

static AgentTurnInput ParseTurnInput(JsonElement root)

{

    var incoming = new List<Concept>();

    if (root.TryGetProperty("incomingConcepts", out var conceptsEl) && conceptsEl.ValueKind == JsonValueKind.Array)

    {

        foreach (var item in conceptsEl.EnumerateArray())
        {
            var category = item.TryGetProperty("category", out var catEl) ? catEl.GetString()?.Trim() : null;
            if (string.IsNullOrWhiteSpace(category)) continue;

            var values = ParseIncomingConceptValues(item);
            if (values.Count == 0) continue;

            var kind = item.TryGetProperty("kind", out var kindEl) ? kindEl.GetString()?.Trim() : null;
            var unit = item.TryGetProperty("unit", out var unitEl) ? unitEl.GetString()?.Trim() : null;

            incoming.Add(new Concept
            {
                Category = category,
                Values = values,
                Kind = ParseConceptKind(kind),
                Unit = unit,
            });
        }
    }
    else if (root.TryGetProperty("incomingSlots", out var slotsEl) && slotsEl.ValueKind == JsonValueKind.Array)
    {
        foreach (var item in slotsEl.EnumerateArray())
        {
            var category = item.TryGetProperty("categoryName", out var catEl) ? catEl.GetString()?.Trim() : null;
            if (string.IsNullOrWhiteSpace(category)) continue;

            var values = ParseIncomingConceptValues(item);
            if (values.Count == 0) continue;

            incoming.Add(new Concept { Category = category, Values = values });
        }
    }



    var transcript = root.TryGetProperty("transcript", out var txEl) ? txEl.GetString()?.Trim() : null;

    var confirmImplicit = root.TryGetProperty("confirmImplicitConcepts", out var ciEl) && ciEl.GetBoolean();



    return new AgentTurnInput

    {

        IncomingConcepts = incoming,

        Transcript = transcript,

        ConfirmImplicitConcepts = confirmImplicit,

        DisambiguationAnswerContext = ParseAnswerContext(root),

    };

}



static AgentTurnResult RunTurn(AgentBundle bundle, AgentSessionState state, AgentTurnInput turn)

{

    return AgentTurnEngine.ProcessAgentTurn(bundle, state, turn);

}



app.MapGet("/health", () => Results.Json(new { ok = true, engine = "vb-dialog" }));



app.MapPost("/api/runtime/agent-turn", async (HttpRequest request) =>

{

    try

    {

        using var doc = await JsonDocument.ParseAsync(request.Body);

        var root = doc.RootElement;



        if (!root.TryGetProperty("bundle", out var bundleEl))

            return Results.Json(new { ok = false, error = "bundle mancante." }, statusCode: 400);



        var bundle = BundleJson.LoadBundle(bundleEl.GetRawText());

        if (bundle.Catalog?.Items is null || bundle.Catalog.Items.Count == 0)

            return Results.Json(new { ok = false, error = "bundle.catalog.items vuoto." }, statusCode: 400);



        var reset = root.TryGetProperty("reset", out var resetEl) && resetEl.GetBoolean();

        AgentSessionState state;

        if (reset || !root.TryGetProperty("state", out var stateEl) || stateEl.ValueKind is JsonValueKind.Null)

            state = AgentTurnEngine.InitAgentSession();

        else

            state = TurnJson.LoadSessionState(stateEl);



        var turn = ParseTurnInput(root);

        var result = RunTurn(bundle, state, turn);



        var conversationId = root.TryGetProperty("conversationId", out var convEl) ? convEl.GetString()?.Trim() : null;

        var documentId = root.TryGetProperty("documentId", out var docEl) ? docEl.GetString()?.Trim() : null;



        if (!string.IsNullOrWhiteSpace(conversationId) && !string.IsNullOrWhiteSpace(documentId))

        {

            var http = HttpResponseBuilder.BuildAgentDialogStepHttpResponse(conversationId, documentId, result);

            return Results.Json(http, jsonOptions);

        }



        return Results.Json(new

        {

            ok = true,

            instruction = result.Instruction,

            parsed = result.Parsed,

            spokenHint = result.SpokenHint,

            spokenHintSource = result.SpokenHintSource,

            disambiguationSignature = result.DisambiguationSignature,

            candidateCount = result.CandidateCount,

            candidatePaths = result.SurvivingPaths,

            nextState = result.NextState,

        }, jsonOptions);

    }

    catch (Exception ex)

    {

        return Results.Json(new { ok = false, error = ex.Message }, statusCode: 500);

    }

});



app.MapPost("/api/test/text-turn", async (HttpRequest request) =>

{

    try

    {

        using var doc = await JsonDocument.ParseAsync(request.Body);

        var root = doc.RootElement;



        var userText = root.TryGetProperty("userText", out var textEl)

            ? textEl.GetString()?.Trim() ?? string.Empty

            : string.Empty;



        if (string.IsNullOrWhiteSpace(userText))

            return Results.Json(new { ok = false, error = "userText mancante." }, statusCode: 400);



        if (!root.TryGetProperty("bundle", out var bundleEl))

            return Results.Json(new { ok = false, error = "bundle mancante." }, statusCode: 400);



        var bundle = BundleJson.LoadBundle(bundleEl.GetRawText());

        if (bundle.Catalog?.Items is null || bundle.Catalog.Items.Count == 0)

            return Results.Json(new { ok = false, error = "bundle.catalog.items vuoto." }, statusCode: 400);



        var reset = root.TryGetProperty("reset", out var resetEl) && resetEl.GetBoolean();

        AgentSessionState state;

        if (reset || !root.TryGetProperty("state", out var stateEl) || stateEl.ValueKind is JsonValueKind.Null)

            state = AgentTurnEngine.InitAgentSession();

        else

            state = TurnJson.LoadSessionState(stateEl);



        var answerContext = ParseAnswerContext(root);

        var result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, userText, answerContext);



        return Results.Json(new

        {

            ok = true,

            spokenHint = result.SpokenHint,

            spokenHintSource = result.SpokenHintSource,

            disambiguationSignature = result.DisambiguationSignature,

            selectedPath = result.NextState.SelectedPath,

            nextState = result.NextState,

            instruction = result.Instruction,

            parsed = result.Parsed,

            candidateCount = result.CandidateCount,

            candidatePaths = result.SurvivingPaths,

            debug = new

            {

                log = HttpResponseBuilder.FormatInstructionLog(result.Instruction),

                parsedBlock = AgentTurnEngine.FormatAgentParsedBlock(result.Parsed, result.Instruction),

            },

        }, jsonOptions);

    }

    catch (Exception ex)

    {

        return Results.Json(new { ok = false, error = ex.Message }, statusCode: 500);

    }

});



app.MapPost("/api/test/bootstrap-turn", async (HttpRequest request) =>

{

    try

    {

        using var doc = await JsonDocument.ParseAsync(request.Body);

        var root = doc.RootElement;



        if (!root.TryGetProperty("bundle", out var bundleEl))

            return Results.Json(new { ok = false, error = "bundle mancante." }, statusCode: 400);



        var bundle = BundleJson.LoadBundle(bundleEl.GetRawText());

        if (bundle.Catalog?.Items is null || bundle.Catalog.Items.Count == 0)

            return Results.Json(new { ok = false, error = "bundle.catalog.items vuoto." }, statusCode: 400);



        var reset = root.TryGetProperty("reset", out var resetEl) && resetEl.GetBoolean();

        AgentSessionState state;

        if (reset || !root.TryGetProperty("state", out var stateEl) || stateEl.ValueKind is JsonValueKind.Null)

            state = AgentTurnEngine.InitAgentSession();

        else

            state = TurnJson.LoadSessionState(stateEl);



        var result = AgentTurnEngine.ProcessBootstrapTurn(bundle, state);



        return Results.Json(new

        {

            ok = true,

            spokenHint = result.SpokenHint,

            spokenHintSource = result.SpokenHintSource,

            disambiguationSignature = result.DisambiguationSignature,

            selectedPath = result.NextState.SelectedPath,

            nextState = result.NextState,

            instruction = result.Instruction,

            parsed = result.Parsed,

            candidateCount = result.CandidateCount,

            candidatePaths = result.SurvivingPaths,

            debug = new

            {

                log = HttpResponseBuilder.FormatInstructionLog(result.Instruction),

                parsedBlock = AgentTurnEngine.FormatAgentParsedBlock(result.Parsed, result.Instruction),

            },

        }, jsonOptions);

    }

    catch (Exception ex)

    {

        return Results.Json(new { ok = false, error = ex.Message }, statusCode: 500);

    }

});



app.MapPost("/api/grammar/match-answer", async (HttpRequest request) =>
{
    try
    {
        using var doc = await JsonDocument.ParseAsync(request.Body);
        var root = doc.RootElement;

        var text = root.TryGetProperty("text", out var textEl) ? textEl.GetString()?.Trim() ?? string.Empty : string.Empty;
        if (string.IsNullOrWhiteSpace(text))
            return Results.Json(new { matchedOption = (string?)null, matchedOptions = Array.Empty<string>(), compileError = "text mancante." }, jsonOptions, statusCode: 400);

        if (!root.TryGetProperty("graph", out var graphEl))
            return Results.Json(new { matchedOption = (string?)null, matchedOptions = Array.Empty<string>(), compileError = "graph mancante." }, jsonOptions, statusCode: 400);

        var graph = JsonSerializer.Deserialize<GrammarGraph>(graphEl.GetRawText(), jsonOptions);
        if (graph is null)
            return Results.Json(new { matchedOption = (string?)null, matchedOptions = Array.Empty<string>(), compileError = "graph non valido." }, jsonOptions, statusCode: 400);

        var result = AnswerGrammarMatch.MatchGrammarGraph(text, graph);
        return Results.Json(new
        {
            matchedOption = result.MatchedOption,
            matchedOptions = result.MatchedOptions,
            compileError = result.CompileError,
        }, jsonOptions);
    }
    catch (Exception ex)
    {
        return Results.Json(new
        {
            matchedOption = (string?)null,
            matchedOptions = Array.Empty<string>(),
            compileError = ex.Message,
        }, jsonOptions, statusCode: 500);
    }
});



app.Run();

