import 'package:flutter/material.dart';

import 'theme.dart';

/// Standard scrolling page body: optional pull-to-refresh and an optional footer
/// pinned above the home indicator for the page's main action.
class PcScreen extends StatelessWidget {
  const PcScreen({super.key, required this.children, this.footer, this.onRefresh, this.padding = const EdgeInsets.all(16), this.gap = 16});

  final List<Widget> children;
  final Widget? footer;
  final Future<void> Function()? onRefresh;
  final EdgeInsets padding;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final c = context.pc;
    final list = ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: children.length,
      separatorBuilder: (_, __) => SizedBox(height: gap),
      itemBuilder: (_, i) => children[i],
    );
    return Column(children: [
      Expanded(child: onRefresh == null ? list : RefreshIndicator(color: Brand.teal, onRefresh: onRefresh!, child: list)),
      if (footer != null)
        Container(
          decoration: BoxDecoration(color: c.card, border: Border(top: BorderSide(color: c.border))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SafeArea(top: false, child: footer!),
        ),
    ]);
  }
}
