import type { CreativeProject, AdElement, SlideConfig } from '../model/types';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  elementId?: string;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

function slideAssetIssues(
  el: AdElement,
  slides: SlideConfig[],
  assetIds: Set<string>,
  out: ValidationIssue[],
) {
  slides.forEach((s, i) => {
    if (s.assetId && !assetIds.has(s.assetId)) {
      out.push({
        level: 'error',
        message: `"${el.name}" slide ${i + 1} references a missing asset`,
        elementId: el.id,
      });
    }
  });
}

/**
 * Pre-export sanity checks. These are platform-agnostic checks —
 * per-network requirements (DV360 file weight, MRAID, etc.) still need
 * manual verification; see README "Ad platform validation".
 */
export function validateForExport(project: CreativeProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { width: W, height: H } = project.artboard;
  const assetIds = new Set(project.assets.map((a) => a.id));

  if (!Number.isFinite(W) || !Number.isFinite(H) || W < 10 || H < 10) {
    issues.push({ level: 'error', message: 'Artboard dimensions are invalid' });
  }
  if (!project.elements.length) {
    issues.push({ level: 'warning', message: 'Creative has no elements — export will be blank' });
  }
  if (project.clickTag.trim() && !URL_RE.test(project.clickTag.trim())) {
    issues.push({
      level: 'warning',
      message: `clickTag "${project.clickTag}" is not a valid http(s) URL — a placeholder will be exported`,
    });
  }

  for (const el of project.elements) {
    if (!el.visible) continue;
    if (el.x + el.width < 0 || el.y + el.height < 0 || el.x > W || el.y > H) {
      issues.push({
        level: 'warning',
        message: `"${el.name}" is completely outside the artboard`,
        elementId: el.id,
      });
    }
    switch (el.type) {
      case 'image':
        if (el.assetId && !assetIds.has(el.assetId)) {
          issues.push({ level: 'error', message: `"${el.name}" references a missing asset`, elementId: el.id });
        } else if (!el.assetId) {
          issues.push({ level: 'warning', message: `"${el.name}" has no image assigned`, elementId: el.id });
        }
        break;
      case 'button':
        if (el.url && !URL_RE.test(el.url)) {
          issues.push({ level: 'error', message: `"${el.name}" has an invalid click-through URL`, elementId: el.id });
        }
        break;
      case 'carousel':
      case 'fan-carousel':
      case 'card-stack':
      case 'vertical-slider':
        slideAssetIssues(el, el.config.slides, assetIds, issues);
        if (el.config.slides.length < 2) {
          issues.push({ level: 'warning', message: `"${el.name}" has fewer than 2 slides`, elementId: el.id });
        }
        break;
      case 'cube':
        el.config.faces.forEach((f, i) => {
          if (f && !assetIds.has(f)) {
            issues.push({ level: 'error', message: `"${el.name}" face ${i + 1} references a missing asset`, elementId: el.id });
          }
        });
        if (el.config.faces.every((f) => !f)) {
          issues.push({ level: 'warning', message: `"${el.name}" has no face images assigned`, elementId: el.id });
        }
        break;
    }
  }

  return issues;
}
