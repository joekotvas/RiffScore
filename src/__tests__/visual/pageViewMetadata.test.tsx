/**
 * Page-view metadata track rendered through the real ScoreEditor pipeline.
 *
 * A score with a top-level `title` but no `metadata` block (what most host JSON looks like) must
 * show that title in the page-view metadata track — the same title the scroll view prints and
 * PageLayoutService positions — instead of the "Untitled" default.
 */

import { renderScore } from '../helpers/visual';
import { createDefaultScore, Score } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

const buildScore = (title: string): Score => {
  const score = createDefaultScore();
  score.title = title;
  delete score.metadata;
  score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };
  return score;
};

const renderedTitle = (container: HTMLElement): string | null =>
  container.querySelector('.riff-MetadataTrack text[data-field="title"]')?.textContent ?? null;

describe('page view metadata track', () => {
  it("shows the score's top-level title when there is no metadata block", () => {
    const { container, unmount } = renderScore(buildScore('My Song'));
    try {
      expect(renderedTitle(container)).toBe('My Song');
    } finally {
      unmount();
    }
  });

  it('prefers the metadata block title when one exists', () => {
    const score = buildScore('My Song');
    score.metadata = { title: 'Metadata Title' };
    const { container, unmount } = renderScore(score);
    try {
      expect(renderedTitle(container)).toBe('Metadata Title');
    } finally {
      unmount();
    }
  });
});
