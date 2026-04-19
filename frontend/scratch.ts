import { adjustHeadingLevel } from "./src/utils/markdownEditorFormatting.ts";
console.log(adjustHeadingLevel("test", 0, 0, 1));
console.log(adjustHeadingLevel("# test", 0, 0, 1));
console.log(adjustHeadingLevel("## test", 0, 0, -1));
