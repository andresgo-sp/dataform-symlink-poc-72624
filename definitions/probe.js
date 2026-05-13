const fs = require("fs");
const notebookContents = require("includes/notebook_content");
notebook({
  name: "probe",
  filename: "probe.ipynb",
  notebookContents: notebookContents
});
