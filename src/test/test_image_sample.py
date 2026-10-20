"""Execute the exact displayed Python sample, without camera or network access."""
from pathlib import Path
import re
import unittest


class ImageSampleTests(unittest.TestCase):
    def test_bounded_contrast_and_input_validation(self):
        source = (Path(__file__).parents[1] / "data" / "evolution.ts").read_text()
        match = re.search(r'id: "image-contrast".*?code: `([^`]*)`', source, re.S)
        self.assertIsNotNone(match)
        namespace = {}
        exec(match.group(1), namespace)
        adjust = namespace["adjust_contrast"]
        self.assertEqual(adjust([0, 128, 255], 2), [0, 128, 255])
        self.assertEqual(adjust([10, 20], 1), [10, 20])
        for factor in [float("nan"), float("inf"), -1, 5, True]:
            with self.assertRaises(ValueError):
                adjust([128], factor)
        for pixel in [-1, 256, 1.5, True]:
            with self.assertRaises(ValueError):
                adjust([pixel], 1)


if __name__ == "__main__":
    unittest.main()