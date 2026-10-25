import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:primecabs_core/primecabs_core.dart';
import 'package:primecabs_ui/primecabs_ui.dart';

import '../app_state.dart';
import '../router.dart';

class PayoutScreen extends ConsumerStatefulWidget {
  const PayoutScreen({super.key});
  @override
  ConsumerState<PayoutScreen> createState() => _PayoutScreenState();
}

class _PayoutScreenState extends ConsumerState<PayoutScreen> {
  final _holder = TextEditingController(), _account = TextEditingController(), _confirm = TextEditingController(), _ifsc = TextEditingController(), _upi = TextEditingController();
  String _method = 'BANK';
  bool _touched = false, _busy = false, _filled = false;
  String? _apiError;

  @override
  void dispose() {
    for (final c in [_holder, _account, _confirm, _ifsc, _upi]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(DriverMe me) {
    if (_filled) return;
    _filled = true;
    _method = me.upiId != null && me.bankLast4 == null ? 'UPI' : 'BANK';
    _holder.text = me.bankAccountName ?? me.name ?? '';
    _ifsc.text = me.bankIfsc ?? '';
    _upi.text = me.upiId ?? '';
  }

  Map<String, String?> _errors(DriverMe? me) {
    if (_method == 'UPI') {
      return {'upi': RegExp(r'^[\w.-]{2,256}@[a-zA-Z]{2,64}$').hasMatch(_upi.text.trim()) ? null : 'Enter a UPI ID like name@okaxis'};
    }
    final keepSaved = me?.bankLast4 != null && _account.text.isEmpty;
    return {
      'holder': _holder.text.trim().length < 2 ? 'Enter the name on the bank account' : null,
      'account': keepSaved || RegExp(r'^\d{9,18}$').hasMatch(_account.text) ? null : 'Account number must be 9 to 18 digits',
      'confirm': _account.text != _confirm.text ? "The account numbers don't match" : null,
      'ifsc': RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(_ifsc.text) ? null : 'Enter the 11-character IFSC, for example SBIN0001234',
    };
  }

  Future<void> _save(DriverMe? me) async {
    setState(() => _touched = true);
    if (_errors(me).values.any((e) => e != null)) return;
    setState(() {
      _busy = true;
      _apiError = null;
    });
    try {
      await ref.read(apiProvider).put(
            '/driver/me',
            _method == 'BANK'
                ? {'bankAccountName': _holder.text.trim(), 'bankIfsc': _ifsc.text, if (_account.text.isNotEmpty) 'bankAccountNo': _account.text}
                : {'upiId': _upi.text.trim()},
          );
      ref.invalidate(meProvider);
      if (!mounted) return;
      toast(context, 'Payout details saved');
      goBack(context, '/onboarding');
    } on ApiError catch (e) {
      setState(() => _apiError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(meProvider).value;
    if (me != null) _fill(me);
    final errors = _errors(me);
    String? show(String k) => _touched ? errors[k] : null;
    void touch(_) => setState(() {});

    return Scaffold(
      appBar: AppBar(title: const Text('How you get paid')),
      body: PcScreen(
        footer: Btn('Save', loading: _busy, onPressed: () => _save(me)),
        children: [
          const Txt.small('PrimeCabs pays your earnings to this account. Your account number is stored encrypted.'),
          PcChoice<String>(
            value: _method,
            onChanged: (v) => setState(() => _method = v),
            options: const [ChoiceOption('BANK', 'Bank account'), ChoiceOption('UPI', 'UPI ID')],
          ),
          if (_method == 'BANK') ...[
            if (me?.bankLast4 != null) PcBanner(body: 'Saved account ending ••${me!.bankLast4}. Enter a new number only if you want to change it.'),
            PcField(label: 'Account holder name', controller: _holder, error: show('holder'), textCapitalization: TextCapitalization.words, onChanged: touch),
            PcField(label: 'Account number', controller: _account, error: show('account'), obscure: true, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], onChanged: touch),
            PcField(label: 'Confirm account number', controller: _confirm, error: show('confirm'), keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], onChanged: touch),
            PcField(
              label: 'IFSC code',
              controller: _ifsc,
              error: show('ifsc'),
              hint: 'Printed on your cheque book or passbook',
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')), LengthLimitingTextInputFormatter(11), _UpperCase()],
              onChanged: touch,
            ),
          ] else
            PcField(label: 'UPI ID', controller: _upi, error: show('upi'), placeholder: 'name@okaxis', keyboardType: TextInputType.emailAddress, onChanged: touch),
          if (_apiError != null) PcBanner(tone: Tone.danger, body: _apiError!),
        ],
      ),
    );
  }
}

class _UpperCase extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) => newValue.copyWith(text: newValue.text.toUpperCase());
}
