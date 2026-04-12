import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_IDS, CAMPAIGN_LABELS, VIDEO_TYPES, TEXT_TYPES,
  orientationFromFieldType, detectOrientation,
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

  describe('detectOrientation', () => {
    it('detects 9x16 from 1080x1920 in name', () => {
      expect(detectOrientation('UH_UA_ReikaSolo_30s_1080x1920_VD', 'YOUTUBE_VIDEO')).toBe('9x16');
    });

    it('detects 1x1 from 1080x1080 in name', () => {
      expect(detectOrientation('UH_UA_WhatIsYourName_30s_1080x1080_VD', 'YOUTUBE_VIDEO')).toBe('1x1');
    });

    it('detects 16x9 from 1920x1080 in name', () => {
      expect(detectOrientation('UH_UA_KillCount_30s_1920x1080_VD', 'YOUTUBE_VIDEO')).toBe('16x9');
    });

    it('falls back to fieldType when name has no resolution', () => {
      expect(detectOrientation('Urban Heat - High Action FPS', 'PORTRAIT_YOUTUBE_VIDEO')).toBe('9x16');
      expect(detectOrientation('Urban Heat - High Action FPS', 'YOUTUBE_VIDEO')).toBe('16x9');
    });

    it('falls back to fieldType when name is null', () => {
      expect(detectOrientation(null, 'SQUARE_YOUTUBE_VIDEO')).toBe('1x1');
    });
  });
});
