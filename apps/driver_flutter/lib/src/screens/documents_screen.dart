// Upload each required document by camera, gallery or PDF. The latest upload counts.
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

const _maxBytes = 5 * 1024 * 1024;

enum _Source { camera, gallery, pdf }

(String, Tone) _statusOf(ChecklistItem i) {
  if (i.documentId == null) return i.required ? ('Needed', Tone.warning) : ('Optional', Tone.neutral);
  return switch (i.status) {
    ReviewStatus.approved => ('Approved', Tone.success),
    ReviewStatus.rejected => ('Upload again', Tone.danger),
    _ => ('Uploaded', Tone.info),
  };
}

class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pc;
    final meAsync = ref.watch(meProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: meAsync.when(
        loading: () => PcScreen(children: [for (var i = 0; i < 3; i++) const Skeleton(height: 72)]),
        error: (e, _) => ErrorView(message: errorMessage(e), onRetry: () => ref.invalidate(meProvider)),
        data: (me) {
          final items = me.documents.where((i) => i.required || i.documentId != null).toList();
          final missing = me.missingDocuments.length;
          Widget group(List<ChecklistItem> list) => PcCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Column(children: [
                  for (var i = 0; i < list.length; i++) ...[if (i > 0) const Divider(), _DocRow(item: list[i])],
                ]),
              );
          return PcScreen(
            onRefresh: () async => ref.refresh(meProvider.future),
            footer: Btn(missing > 0 ? '$missing still needed' : 'Done', kind: missing > 0 ? BtnKind.secondary : BtnKind.primary, onPressed: missing > 0 ? null : () => goBack(context, '/onboarding')),
            children: [
              const Txt.small('Take clear photos in good light with all four corners visible. JPG, PNG or PDF, up to 5 MB each.'),
              if (me.status == DriverStatus.approved)
                const PcBanner(tone: Tone.warning, body: "Replacing a document sends your profile for review again. You can't publish new rides until it's approved."),
              const Txt.label('About you'),
              group(items.where((i) => i.vehicleId == null).toList()),
              for (final v in me.vehicles) ...[
                Txt.label('${v.make} ${v.model} · ${v.registrationNo}'),
                group(items.where((i) => i.vehicleId == v.id).toList()),
              ],
              if (me.vehicles.isEmpty) Txt.small('Add your vehicle first to see its documents.', color: c.textMuted),
            ],
          );
        },
      ),
    );
  }
}

class _DocRow extends ConsumerWidget {
  const _DocRow({required this.item});
  final ChecklistItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pc;
    final (label, tone) = _statusOf(item);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(item.status == ReviewStatus.approved ? Icons.check_circle : Icons.description_outlined, color: item.status == ReviewStatus.approved ? c.success : c.textSecondary),
          const SizedBox(width: 8),
          Expanded(child: Txt.strong(item.label)),
          StatusChip(label, tone: tone),
        ]),
        if (item.status == ReviewStatus.rejected && item.rejectReason != null) Padding(padding: const EdgeInsets.only(top: 6), child: Txt.small(item.rejectReason!, color: c.danger)),
        if (item.status != ReviewStatus.approved) ...[
          const SizedBox(height: 8),
          Btn(item.documentId == null ? 'Upload' : 'Replace', kind: BtnKind.secondary, compact: true, icon: Icons.cloud_upload_outlined, onPressed: () => _openUpload(context, ref, item)),
        ],
      ]),
    );
  }
}

Future<void> _openUpload(BuildContext context, WidgetRef ref, ChecklistItem item) {
  return showPcSheet(context, title: 'Upload ${item.label}', builder: (_) => _UploadSheet(item: item));
}

class _UploadSheet extends ConsumerStatefulWidget {
  const _UploadSheet({required this.item});
  final ChecklistItem item;
  @override
  ConsumerState<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends ConsumerState<_UploadSheet> {
  final _expiry = TextEditingController();
  bool _expiryTouched = false;
  _Source? _busy;

  @override
  void dispose() {
    _expiry.dispose();
    super.dispose();
  }

  Future<UploadFile?> _pick(_Source source) async {
    if (source == _Source.pdf) {
      final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png']);
      final f = files.firstOrNull;
      if (f == null) return null;
      final ext = (f.extension ?? '').replaceFirst('.', '').toLowerCase();
      return UploadFile(bytes: await f.readAsBytes(), filename: f.name, mimeType: ext == 'pdf' ? 'application/pdf' : (ext == 'png' ? 'image/png' : 'image/jpeg'));
    }
    final x = await ImagePicker().pickImage(source: source == _Source.camera ? ImageSource.camera : ImageSource.gallery, imageQuality: 70, maxWidth: 2400);
    if (x == null) return null;
    final bytes = await x.readAsBytes();
    final png = (x.mimeType ?? x.name).toLowerCase().contains('png');
    return UploadFile(bytes: bytes, filename: x.name, mimeType: png ? 'image/png' : 'image/jpeg');
  }

  Future<void> _upload(_Source source) async {
    final expiry = widget.item.hasExpiry ? parseExpiry(_expiry.text) : null;
    if (widget.item.hasExpiry && expiry == null) {
      setState(() => _expiryTouched = true);
      return;
    }
    setState(() => _busy = source);
    try {
      final file = await _pick(source);
      if (file == null) return;
      if (file.bytes.length > _maxBytes) throw ApiError(400, 'FILE_TOO_LARGE', 'Files must be 5 MB or smaller. Take a new photo or choose a smaller file.');
      await ref.read(apiProvider).upload('/driver/documents', fields: {
        'documentTypeId': widget.item.documentTypeId,
        'vehicleId': ?widget.item.vehicleId,
        'expiryDate': ?expiry,
      }, file: file);
      ref.invalidate(meProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      toast(context, '${widget.item.label} uploaded');
    } on ApiError catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } catch (_) {
      if (mounted) toast(context, "Couldn't open that file. Try another.", error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final expiryError = widget.item.hasExpiry && _expiryTouched && parseExpiry(_expiry.text) == null ? 'Enter the expiry date as DD/MM/YYYY (it must be in the future)' : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.item.hasExpiry) ...[
        PcField(label: 'Expiry date', controller: _expiry, placeholder: 'DD/MM/YYYY', keyboardType: TextInputType.datetime, error: expiryError, onChanged: (_) => setState(() {})),
        const SizedBox(height: 16),
      ],
      if (!kIsWeb) ...[
        Btn('Take a photo', icon: Icons.photo_camera_outlined, loading: _busy == _Source.camera, onPressed: _busy == null ? () => _upload(_Source.camera) : null),
        const SizedBox(height: 10),
      ],
      Btn('Choose from gallery', kind: BtnKind.secondary, icon: Icons.photo_library_outlined, loading: _busy == _Source.gallery, onPressed: _busy == null ? () => _upload(_Source.gallery) : null),
      const SizedBox(height: 10),
      Btn('Choose a PDF file', kind: BtnKind.secondary, icon: Icons.picture_as_pdf_outlined, loading: _busy == _Source.pdf, onPressed: _busy == null ? () => _upload(_Source.pdf) : null),
      const SizedBox(height: 8),
    ]);
  }
}
