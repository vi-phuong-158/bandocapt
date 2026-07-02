const VERBOSITY_LIMIT_NARROW = 120;
const VERBOSITY_LIMIT_FULL = 250;
const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });

function countWords(text) {
    return Array.from(WORD_SEGMENTER.segment(String(text || '')))
        .filter(segment => segment.isWordLike)
        .length;
}

module.exports = {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
};
