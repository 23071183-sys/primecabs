// Extracts filled form fields from the PrimeCabs requirements PDF.
// Uses macOS PDFKit via JavaScript for Automation, so it needs no Python or Node.
// Usage: osascript -l JavaScript tools/extract_pdf_answers.js <path-to-pdf>
// Prints one JSON object per filled field: {field, page, type, value, label}.
// "label" is the text printed to the right of a ticked box.

ObjC.import("PDFKit");

function run(argv) {
  if (argv.length < 1) return "Usage: osascript -l JavaScript extract_pdf_answers.js <pdf>";
  var doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (doc.isNil()) return "Could not open " + argv[0];

  var rows = [];
  for (var p = 0; p < doc.pageCount; p++) {
    var page = doc.pageAtIndex(p);
    var anns = page.annotations;
    for (var i = 0; i < anns.count; i++) {
      var a = anns.objectAtIndex(i);
      var name = ObjC.unwrap(a.fieldName);
      if (!name) continue;
      var type = ObjC.unwrap(a.widgetFieldType);
      if (type === "/Btn") {
        if (a.buttonWidgetState != 1) continue;
        var b = a.bounds;
        var rect = $.NSMakeRect(b.origin.x + b.size.width + 1, b.origin.y - 1, 400, b.size.height + 2);
        var sel = page.selectionForRect(rect);
        var label = sel.isNil() ? "" : ObjC.unwrap(sel.string).replace(/\s+/g, " ").trim();
        rows.push(JSON.stringify({ field: name, page: p + 1, type: "checkbox", value: true, label: label }));
      } else {
        var v = ObjC.unwrap(a.widgetStringValue);
        if (v) rows.push(JSON.stringify({ field: name, page: p + 1, type: "text", value: v }));
      }
    }
  }
  return rows.join("\n");
}
