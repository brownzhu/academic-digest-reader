import { IpnetDigestParser } from "./ipnet-digest-parser";
import { MailmanDigestParser } from "./mailman-digest-parser";
import { NaDigestParser } from "./na-digest-parser";
import { ParserRegistry } from "./parser-registry";

/** One registry for production and integration tests. No heuristic fallback. */
export function createParserRegistry(): ParserRegistry {
  return new ParserRegistry([new NaDigestParser(), new IpnetDigestParser(), new MailmanDigestParser()]);
}
