import unittest

import verify_citations as vc


class NormTests(unittest.TestCase):
    def test_case_curly_quotes_dashes_and_spacing_do_not_defeat_a_match(self):
        page = vc.norm("The City\u2019s  \u201cWage\u201d \u2013 Tax")
        self.assertEqual(vc.norm("the city's \"wage\" - tax"), page)

    def test_the_same_amount_normalises_the_same_way_on_both_sides(self):
        self.assertIn(vc.norm("$1,234.50 weekly"), vc.norm("Pay $1,234.50 weekly, every week"))

    def test_a_different_amount_does_not_match(self):
        self.assertNotIn(vc.norm("$1,234.50 weekly"), vc.norm("Pay $1,234.05 weekly"))


class PiecesTests(unittest.TestCase):
    def test_elision_splits_a_quote_and_short_fragments_are_dropped(self):
        got = vc.pieces("The user fee applies to those who work within the city limits ... $2.00 a week")
        self.assertEqual(got, ["the user fee applies to those who work within the city limits"])

    def test_a_bracketed_editor_note_is_an_elision(self):
        got = vc.pieces("the standard deduction for 2027 is [sic] $3,470.00, an increase of $110.00")
        self.assertEqual(len(got), 2)


class NoteQuotesTests(unittest.TestCase):
    def test_only_a_quote_the_note_introduces_as_the_sources_words_counts(self):
        note = "Read directly. Quoted: 'the minimum wage for non-tipped employees will be $12.30/hour' on the page."
        self.assertEqual(len(vc.quoted_in_note(note)), 1)

    def test_a_quoted_instruction_to_the_model_is_not_the_sources_words(self):
        note = "The task said: 'find and fix anything missing across all 50 states and the district'."
        self.assertEqual(vc.quoted_in_note(note), [])

    def test_a_quote_with_no_introducing_word_is_ignored(self):
        note = "We looked at 'a long passage that sounds like it came from the page itself, honest' once."
        self.assertEqual(vc.quoted_in_note(note), [])


class CitationsTests(unittest.TestCase):
    def test_strict_and_loose_fields_are_kept_apart_and_nested_urls_are_found(self):
        doc = {
            "sources": [
                {"url": "https://example.gov/a", "quote": "the rate for tax year 2027 shall be three and one-half percent"},
                {"url": "https://example.gov/b", "says": "Attalla 2% rate column on the 01 2026 return form"},
            ]
        }
        found = list(vc.citations(doc, "x.json"))
        self.assertEqual([c["url"] for c in found], ["https://example.gov/a", "https://example.gov/b"])
        self.assertTrue(found[0]["pieces"] and not found[0]["loose"])
        self.assertTrue(found[1]["loose"] and not found[1]["pieces"])
        self.assertEqual(found[0]["path"], "/sources[0]")

    def test_an_object_without_a_url_is_not_a_citation(self):
        self.assertEqual(list(vc.citations({"quote": "no url here, only words that are long enough"}, "x.json")), [])


if __name__ == "__main__":
    unittest.main()
