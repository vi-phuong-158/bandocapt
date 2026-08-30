(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationAdminReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Minimal Google Sheets/Apps Script admin approval for the dual-workbook Staff Portal
    // pipeline. This module is pure (no SpreadsheetApp/DriveApp calls); the GAS adapter in
    // setup/location-intake/Code.gs injects `privateStore`/`publicStore`/`runtime` and does the
    // actual Sheets/Drive I/O. See docs/brain/03-decisions.md for the reconciliation model.

    const REVIEW_ACTIONS = Object.freeze({ APPROVE: 'APPROVE', REJECT: 'REJECT', NEED_VERIFICATION: 'NEED_VERIFICATION' });

    // Public content fields that legitimately change on every approve just because time passed —
    // excluded from conflict detection so a repeat approve/reconcile of unchanged staging content
    // never reports a false APPROVAL_PUBLIC_CONFLICT.
    const CANONICAL_COMPARE_SKIP_FIELDS = Object.freeze(['updated_at', 'verified_at']);

    function text(value) { return String(value == null ? '' : value).trim(); }

    function coreError(code, details = {}) {
        const error = new Error(code);
        error.code = code;
        Object.assign(error, details);
        return error;
    }

    function normalizeEmailList(csv) {
        return String(csv || '').split(/[,;\n]/).map(value => text(value).toLowerCase()).filter(Boolean);
    }

    // Fail closed by construction: empty/missing allowlist has zero entries, so no email matches.
    function isApprover(email, approverEmailsCsv) {
        const normalized = text(email).toLowerCase();
        if (!normalized) return false;
        return normalizeEmailList(approverEmailsCsv).includes(normalized);
    }

    function buildApproverDiagnostic({ effectiveUserEmail = '', activeUserEmail = '', approverEmailsCsv = '' } = {}) {
        const effectiveEmail = text(effectiveUserEmail).toLowerCase();
        const activeEmail = text(activeUserEmail).toLowerCase();
        return Object.freeze({
            effectiveUserEmail: effectiveEmail,
            activeUserEmail: activeEmail,
            allowlistConfigured: Boolean(text(approverEmailsCsv)),
            effectiveApproverMatch: isApprover(effectiveEmail, approverEmailsCsv),
            activeApproverMatch: isApprover(activeEmail, approverEmailsCsv),
        });
    }

    function deterministicImageUrl(fileId) {
        return fileId ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}` : '';
    }

    // Published_Locations deliberately stores only the public URL. This extracts a Drive file ID
    // solely inside the private review runtime so the old file can be revoked after a replacement.
    // Unknown/non-Drive URLs intentionally produce no candidate: revoking an unproven file would
    // be worse than leaving a legacy URL for a manual follow-up.
    function driveFileIdFromUrl(value) {
        const source = text(value);
        if (!source) return '';
        try {
            const url = new URL(source);
            const queryId = text(url.searchParams.get('id'));
            if (queryId) return queryId;
            const pathMatch = url.pathname.match(/\/d\/([^/?#]+)/);
            return pathMatch ? decodeURIComponent(pathMatch[1]) : '';
        } catch (_) {
            const queryMatch = source.match(/[?&]id=([^&#]+)/);
            return queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        }
    }

    // Compares only the public-facing schema, never private staging columns. Timestamps are
    // excluded — same content re-approved later must not read as a conflict.
    function canonicalPublishedEqual(pipeline, a, b) {
        if (!a || !b) return false;
        return pipeline.PUBLIC_FIELDS.every(field => (
            CANONICAL_COMPARE_SKIP_FIELDS.includes(field) || text(a[field]) === text(b[field])
        ));
    }

    function asIso(runtime, value) {
        const date = value instanceof Date ? value : new Date(value || (runtime.now ? runtime.now() : Date.now()));
        return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    }

    function createLocationAdminReview(options = {}) {
        const pipeline = options.pipeline;
        const workbookConfig = options.workbookConfig;
        const runtime = options.runtime || {};
        const privateStore = options.privateStore;
        const publicStore = options.publicStore;
        if (!pipeline || !workbookConfig) throw coreError('ADMIN_REVIEW_RUNTIME_NOT_CONFIGURED');
        if (!privateStore || !publicStore) throw coreError('ADMIN_REVIEW_STORE_NOT_CONFIGURED');

        function withLock(callback) {
            return runtime.withLock ? runtime.withLock(callback) : callback();
        }

        function findStagingRow(requestId) {
            return (privateStore.getStagingRows() || []).find(row => text(row.request_id) === text(requestId)) || null;
        }

        function hasAuditEntry(requestId, action) {
            return (privateStore.getAuditRows() || []).some(row => text(row.request_id) === text(requestId) && text(row.action) === action);
        }

        function findAuditEntry(requestId, action) {
            return (privateStore.getAuditRows() || []).find(row => text(row.request_id) === text(requestId) && text(row.action) === action) || null;
        }

        // Dedup by request_id + action: a retry after an audit-append crash (F3) must not create
        // a second logical entry for the same completed business mutation.
        function ensureAudit(action, payload) {
            if (hasAuditEntry(payload.requestId, action)) return false;
            privateStore.appendAuditRow(pipeline.buildAuditEntry(action, payload));
            return true;
        }

        function ensureStagingStatus(row, targetStatus, patch) {
            if (text(row.status) === targetStatus) return false;
            privateStore.updateStagingRow(row.request_id, { ...patch, status: targetStatus });
            return true;
        }

        function findPriorPublishedImageFileId(targetId) {
            const approved = (privateStore.getStagingRows() || [])
                .filter(candidate => candidate.status === pipeline.STATUSES.approved &&
                    (text(candidate.record_id) === targetId || text(candidate.target_record_id) === targetId))
                .sort((left, right) => String(right.reviewed_at || right.updated_at).localeCompare(String(left.reviewed_at || left.updated_at)))[0];
            return approved ? text(approved.published_image_file_id) || text(approved.image_file_id) : '';
        }

        function parseReplacementPlan(row) {
            const entry = findAuditEntry(row.request_id, 'IMAGE_REPLACEMENT_PREPARED');
            if (!entry) return null;
            let snapshot;
            try { snapshot = JSON.parse(text(entry.snapshot_json) || '{}'); }
            catch (_) { throw coreError('IMAGE_REPLACEMENT_AUDIT_INVALID'); }
            const plan = snapshot.imageReplacement;
            if (!plan || text(plan.recordId) !== (text(row.target_record_id) || text(row.record_id)) ||
                text(plan.newFileId) !== text(row.image_file_id)) throw coreError('IMAGE_REPLACEMENT_AUDIT_INVALID');
            return {
                oldFileId: text(plan.oldFileId),
                newFileId: text(plan.newFileId),
                revocationRequired: plan.revocationRequired === true,
                skipReason: text(plan.skipReason),
            };
        }

        function isReferencedByAnotherPublicRecord(fileId, targetId) {
            if (!fileId) return false;
            if (!publicStore.getAll) throw coreError('ADMIN_PUBLIC_STORE_NOT_CONFIGURED');
            return (publicStore.getAll() || []).some(record => text(record.record_id) !== text(targetId) &&
                driveFileIdFromUrl(record.image_url) === fileId);
        }

        // The private audit log is the durable reconciliation record for the pre-replacement
        // pointer. It is written before public mutation; consequently a retry can still target A
        // after Published_Locations already points to B, without adding a private identifier to
        // the public schema or a new staging column.
        function prepareReplacementPlan(row, currentTarget, targetId, actorEmail, note, isoNow) {
            const existing = parseReplacementPlan(row);
            if (existing) return existing;
            const oldFileId = driveFileIdFromUrl(currentTarget?.image_url);
            const sharedReference = oldFileId && isReferencedByAnotherPublicRecord(oldFileId, targetId);
            const plan = {
                recordId: targetId,
                oldFileId,
                newFileId: text(row.image_file_id),
                revocationRequired: Boolean(oldFileId && oldFileId !== text(row.image_file_id) && !sharedReference),
                skipReason: !oldFileId ? 'OLD_IMAGE_FILE_ID_UNAVAILABLE' :
                    (oldFileId === text(row.image_file_id) ? 'SAME_FILE_ID' : (sharedReference ? 'SHARED_PUBLIC_REFERENCE' : '')),
            };
            ensureAudit('IMAGE_REPLACEMENT_PREPARED', {
                timestamp: isoNow, recordId: targetId, requestId: row.request_id, unitCode: row.unit_code,
                actorEmail, submitterEmail: row.submitter_email, previousStatus: row.status, nextStatus: row.status,
                note, snapshot: { imageReplacement: plan },
            });
            return plan;
        }

        function finalizeReplacementRevocation(row, plan, targetId, actorEmail, note, isoNow, expected) {
            if (!plan || !plan.revocationRequired || hasAuditEntry(row.request_id, 'IMAGE_REVOKE')) {
                return { imageRevoked: false, imageRevokeError: '' };
            }
            const current = publicStore.findById(targetId);
            if (!canonicalPublishedEqual(pipeline, current, expected)) {
                return { imageRevoked: false, imageRevokeError: 'IMAGE_REVOKE_PUBLIC_STATE_UNVERIFIED' };
            }
            // Recheck immediately before revocation. A file referenced by another public location
            // must never be made private by this request, even if a stale plan said otherwise.
            if (isReferencedByAnotherPublicRecord(plan.oldFileId, targetId)) {
                ensureAudit('IMAGE_REVOKE_SKIPPED_SHARED_REFERENCE', {
                    timestamp: isoNow, recordId: targetId, requestId: row.request_id, unitCode: row.unit_code,
                    actorEmail, submitterEmail: row.submitter_email, previousStatus: pipeline.STATUSES.approved,
                    nextStatus: pipeline.STATUSES.approved, note, snapshot: { imageReplacement: plan },
                });
                return { imageRevoked: false, imageRevokeError: 'IMAGE_REVOKE_SHARED_REFERENCE' };
            }
            if (!runtime.revokeImagePublic) return { imageRevoked: false, imageRevokeError: 'IMAGE_REVOKE_RUNTIME_UNAVAILABLE' };
            try {
                runtime.revokeImagePublic(plan.oldFileId);
                ensureAudit('IMAGE_REVOKE', {
                    timestamp: isoNow, recordId: targetId, requestId: row.request_id, unitCode: row.unit_code,
                    actorEmail, submitterEmail: row.submitter_email, previousStatus: pipeline.STATUSES.approved,
                    nextStatus: pipeline.STATUSES.approved, note, snapshot: { imageReplacement: plan },
                });
                return { imageRevoked: true, imageRevokeError: '' };
            } catch (error) {
                return { imageRevoked: false, imageRevokeError: (error && error.code) || 'IMAGE_REVOKE_FAILED' };
            }
        }

        // Only PENDING is reviewable through the three human actions. NEED_VERIFICATION and
        // BLOCKED are deliberately NOT reviewable here: there is no Staff Portal resubmission
        // flow yet to bring either back to PENDING, so re-reviewing them would be undefined
        // business behavior. See docs/brain/03-decisions.md.
        function classifyForReview(row) {
            if (!row) return { found: false };
            if (row.status === pipeline.STATUSES.pending) return { found: true, reviewable: true };
            const alreadyProcessed = [pipeline.STATUSES.approved, pipeline.STATUSES.rejected, pipeline.STATUSES.revoked].includes(row.status);
            return { found: true, reviewable: false, alreadyProcessed };
        }

        function finalizePrivateOnly(row, action, actorEmail, note, at) {
            const isoNow = asIso(runtime, at);
            const targetStatus = action === REVIEW_ACTIONS.REJECT ? pipeline.STATUSES.rejected : pipeline.STATUSES.needVerification;
            const wroteAudit = ensureAudit(action, {
                timestamp: isoNow, recordId: row.record_id, requestId: row.request_id, unitCode: row.unit_code,
                actorEmail, submitterEmail: row.submitter_email, previousStatus: row.status, nextStatus: targetStatus,
                note, snapshot: { ...row, status: targetStatus, review_note: note, reviewed_by: actorEmail, reviewed_at: isoNow },
            });
            const wroteStaging = ensureStagingStatus(row, targetStatus, {
                review_action: '', review_note: note, reviewed_by: actorEmail, reviewed_at: isoNow, updated_at: isoNow,
            });
            return { ok: true, requestId: row.request_id, status: targetStatus, publicTouched: false, wroteAudit, wroteStaging };
        }

        function finalizeCreateUpdateCorrectApproval(row, actorEmail, note, at) {
            if (row.validation_errors) throw coreError('RECORD_INVALID');
            if (pipeline.requiresNewImage(row.request_type) && !text(row.image_file_id)) throw coreError('IMAGE_REQUIRED');
            const targetId = text(row.target_record_id) || text(row.record_id);
            if (!targetId) throw coreError('TARGET_RECORD_ID_MISSING');
            const isCreate = row.request_type === pipeline.REQUEST_TYPES.create;
            if (isCreate && text(row.target_record_id)) throw coreError('CREATE_TARGET_RECORD_ID_NOT_ALLOWED');
            const currentTarget = publicStore.findById(targetId);
            if (!isCreate && !currentTarget) throw coreError('TARGET_RECORD_ID_NOT_FOUND');
            if (currentTarget && !pipeline.sameUnitCode(currentTarget.unit_code, row.unit_code)) throw coreError('TARGET_RECORD_UNIT_MISMATCH');

            const isoNow = asIso(runtime, at);
            const hasNewImage = Boolean(text(row.image_file_id));
            // The public target, not the browser, is authoritative for a retained image URL.
            const imageUrl = hasNewImage
                ? deterministicImageUrl(row.image_file_id)
                : text(currentTarget?.image_url) || text(row.image_public_url);
            const publishedImageFileId = hasNewImage
                ? text(row.image_file_id)
                : text(row.published_image_file_id) || findPriorPublishedImageFileId(targetId);
            const expected = pipeline.buildPublishedRecord({ ...row, record_id: targetId, image_public_url: imageUrl }, isoNow);
            const replacementPlan = hasNewImage && !isCreate
                ? prepareReplacementPlan(row, currentTarget, targetId, actorEmail, note, isoNow)
                : null;

            // CREATE: target_record_id is fresh/server-generated, so nothing should legitimately
            // exist there yet. If something does and it doesn't exactly match what THIS request
            // would produce (a genuine retry), that's an unrelated collision — fail closed.
            //
            // UPDATE/CORRECT: the target existing with DIFFERENT content is the normal precondition
            // for approval, not a conflict — overwriting old content with new content is the whole
            // point. Ownership + existence are already revalidated above (item 24's scoped list);
            // content equality is checked only to skip a redundant write on retry, never to fail.
            if (isCreate && currentTarget && !canonicalPublishedEqual(pipeline, currentTarget, expected)) {
                throw coreError('APPROVAL_PUBLIC_CONFLICT');
            }
            // New B must become public before Published_Locations points to it. The replacement
            // plan above already makes A recoverable, while staging remains PENDING until every
            // public-record transition has succeeded.
            if (hasNewImage) {
                if (!runtime.setImagePublic) throw coreError('IMAGE_SHARING_RUNTIME_UNAVAILABLE');
                try { runtime.setImagePublic(row.image_file_id); }
                catch (error) { throw coreError('IMAGE_SHARING_FAILED', { recoverable: true }); }
            }
            const publicChanged = !currentTarget || !canonicalPublishedEqual(pipeline, currentTarget, expected);
            if (publicChanged) publicStore.upsert(expected);
            if (!canonicalPublishedEqual(pipeline, publicStore.findById(targetId), expected)) {
                throw coreError('APPROVAL_PUBLIC_WRITE_UNVERIFIED', { recoverable: true });
            }

            const wroteAudit = ensureAudit('APPROVE', {
                timestamp: isoNow, recordId: targetId, requestId: row.request_id, unitCode: row.unit_code,
                actorEmail, submitterEmail: row.submitter_email, previousStatus: row.status, nextStatus: pipeline.STATUSES.approved,
                note, snapshot: { staging: { ...row, status: pipeline.STATUSES.approved }, published: expected },
            });
            const wroteStaging = ensureStagingStatus(row, pipeline.STATUSES.approved, {
                record_id: targetId, review_action: '', review_note: note, reviewed_by: actorEmail, reviewed_at: isoNow,
                updated_at: isoNow, published_image_file_id: publishedImageFileId,
                image_public_url: imageUrl,
            });
            const revocation = finalizeReplacementRevocation(row, replacementPlan, targetId, actorEmail, note, isoNow, expected);
            return {
                ok: true, requestId: row.request_id, recordId: targetId, status: pipeline.STATUSES.approved,
                publicTouched: publicChanged, wroteAudit, wroteStaging, ...revocation,
            };
        }

        function finalizeStopApproval(row, actorEmail, note, at) {
            if (row.validation_errors) throw coreError('RECORD_INVALID');
            const targetId = text(row.target_record_id) || text(row.record_id);
            if (!targetId) throw coreError('TARGET_RECORD_ID_MISSING');
            const currentTarget = publicStore.findById(targetId);
            if (currentTarget && !pipeline.sameUnitCode(currentTarget.unit_code, row.unit_code)) throw coreError('TARGET_RECORD_UNIT_MISMATCH');

            const isoNow = asIso(runtime, at);
            // Desired state is "absent". Already absent (crash-retry / prior partial completion)
            // is success, not an error — unlike the pure single-workbook pipeline, which throws
            // TARGET_RECORD_ID_NOT_FOUND because it assumes one atomic pass.
            if (currentTarget) publicStore.remove(targetId);

            const wroteAudit = ensureAudit('REVOKE', {
                timestamp: isoNow, recordId: targetId, requestId: row.request_id, unitCode: row.unit_code,
                actorEmail, submitterEmail: row.submitter_email, previousStatus: row.status, nextStatus: pipeline.STATUSES.revoked,
                note, snapshot: { staging: { ...row, status: pipeline.STATUSES.revoked }, removed: currentTarget || null },
            });
            const wroteStaging = ensureStagingStatus(row, pipeline.STATUSES.revoked, {
                review_action: '', review_note: note, reviewed_by: actorEmail, reviewed_at: isoNow, updated_at: isoNow,
            });

            // Best-effort only: the business transition above (public removal + REVOKED status)
            // is already committed and must not be rolled back or blocked by a sharing failure.
            // Stale public *data* is the bigger risk for STOP; a still-shared image is the lesser,
            // separately recoverable one (retry via "Đối soát").
            let imageRevoked = false;
            let imageRevokeError = '';
            const imageFileId = text(row.published_image_file_id) || text(row.image_file_id);
            if (imageFileId && runtime.revokeImagePublic) {
                try { runtime.revokeImagePublic(imageFileId); imageRevoked = true; }
                catch (error) { imageRevokeError = (error && error.code) || 'IMAGE_REVOKE_FAILED'; }
            }
            return {
                ok: true, requestId: row.request_id, recordId: targetId, status: pipeline.STATUSES.revoked,
                publicTouched: !!currentTarget, wroteAudit, wroteStaging, imageRevoked, imageRevokeError,
            };
        }

        function applyApproveFlavored(row, actorEmail, note, at) {
            return row.request_type === pipeline.REQUEST_TYPES.stop
                ? finalizeStopApproval(row, actorEmail, note, at)
                : finalizeCreateUpdateCorrectApproval(row, actorEmail, note, at);
        }

        // Human-driven menu actions ("Duyệt/Từ chối/Yêu cầu xác minh"). Requires PENDING.
        function reviewRequest({ requestId, action, actorEmail, note = '', reviewedAt } = {}) {
            const id = text(requestId);
            if (!id) throw coreError('REQUEST_ID_MISSING');
            if (!REVIEW_ACTIONS[action]) throw coreError('REVIEW_ACTION_INVALID');
            if (!text(actorEmail)) throw coreError('ACTOR_EMAIL_MISSING');
            return withLock(() => {
                const row = findStagingRow(id);
                const status = classifyForReview(row);
                if (!status.found) throw coreError('REQUEST_NOT_FOUND');
                if (!status.reviewable) {
                    throw coreError('REQUEST_NOT_REVIEWABLE', {
                        message: status.alreadyProcessed ? 'Yêu cầu này đã được xử lý.' : 'Yêu cầu này chưa thể duyệt ở trạng thái hiện tại.',
                    });
                }
                if (action === REVIEW_ACTIONS.APPROVE) return applyApproveFlavored(row, actorEmail, note, reviewedAt);
                return finalizePrivateOnly(row, action, actorEmail, note, reviewedAt);
            });
        }

        // "Đối soát / hoàn tất yêu cầu đã chọn": no PENDING gate. Derives the already-decided
        // transition from the row's own status/request_type and completes whatever step (public
        // write, image share, audit, staging status) did not finish. Safe to call repeatedly,
        // including on a fully-completed row (every step below is dedup/idempotent).
        function reconcileRequest({ requestId, actorEmail, note = '', reviewedAt } = {}) {
            const id = text(requestId);
            if (!id) throw coreError('REQUEST_ID_MISSING');
            if (!text(actorEmail)) throw coreError('ACTOR_EMAIL_MISSING');
            return withLock(() => {
                const row = findStagingRow(id);
                if (!row) throw coreError('REQUEST_NOT_FOUND');
                if (row.status === pipeline.STATUSES.blocked) {
                    return { ok: true, requestId: id, status: row.status, nothingToReconcile: true, reason: 'BLOCKED' };
                }
                if (row.status === pipeline.STATUSES.rejected || row.status === pipeline.STATUSES.needVerification) {
                    const action = row.status === pipeline.STATUSES.rejected ? REVIEW_ACTIONS.REJECT : REVIEW_ACTIONS.NEED_VERIFICATION;
                    return finalizePrivateOnly(row, action, actorEmail, note, reviewedAt);
                }
                // PENDING (not yet decided) / APPROVED / REVOKED: request_type never changes, so
                // it alone determines which approve-flavored transition applies.
                return applyApproveFlavored(row, actorEmail, note, reviewedAt);
            });
        }

        return Object.freeze({ reviewRequest, reconcileRequest });
    }

    return {
        REVIEW_ACTIONS,
        isApprover,
        buildApproverDiagnostic,
        deterministicImageUrl,
        driveFileIdFromUrl,
        canonicalPublishedEqual,
        createLocationAdminReview,
    };
});
