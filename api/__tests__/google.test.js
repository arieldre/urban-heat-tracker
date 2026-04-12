import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_IDS, CAMPAIGN_LABELS, VIDEO_TYPES, TEXT_TYPES,
  orientationFromFieldType,
} from '../utils/google.js';

describe('google utils', () => {
  describe('CAMPAIGN_IDS', () => {
    it('has 4 campaign IDs', () => {
      expect(CAMPAIGN_IDS).toHaveLength(4);
    });

    it('all IDs are strings of digits', () => {
      for (const id of CAMPAIGN_IDS) {
        expect(id).toMatch(/^\d+$/);
      }
    });

    it('each ID has a label', () => {
      for (const id of CAMPAIGN_IDS) {
        expect(CAMPAIGN_LABELS[id]).toBeTruthy();
      }
    });
  });

  describe('VIDEO_TYPES', () => {
    it('includes standard YouTube video types', () => {
      expect(VIDEO_TYPES.has('YOUTUBE_VIDEO')).toBe(true);
      expect(VIDEO_TYPES.has('PORTRAIT_YOUTUBE_VIDEO')).toBe(true);
      expect(VIDEO_TYPES.has('SQUARE_YOUTUBE_VIDEO')).toBe(true);
    });

    it('does not include text types', () => {
      expect(VIDEO_TYPES.has('HEADLINE')).toBe(false);
      expect(VIDEO_TYPES.has('DESCRIPTION')).toBe(false);
    });
  });

  describe('TEXT_TYPES', () => {
    it('includes headline and description', () => {
      expect(TEXT_TYPES.has('HEADLINE')).toBe(true);
      expect(TEXT_TYPES.has('DESCRIPTION')).toBe(true);
      expect(TEXT_TYPES.has('LONG_HEADLINE')).toBe(true);
    });
  });

  describe('orientationFromFieldType', () => {
    it('returns 9x16 for portrait', () => {
      expect(orientationFromFieldType('PORTRAIT_YOUTUBE_VIDEO')).toBe('9x16');
    });

    it('returns 1x1 for square', () => {
      expect(orientationFromFieldType('SQUARE_YOUTUBE_VIDEO')).toBe('1x1');
    });

    it('returns 16x9 for standard', () => {
      expect(orientationFromFieldType('YOUTUBE_VIDEO')).toBe('16x9');
    });

    it('returns 16x9 for null/undefined', () => {
      expect(orientationFromFieldType(null)).toBe('16x9');
      expect(orientationFromFieldType(undefined)).toBe('16x9');
    });
  });
});
