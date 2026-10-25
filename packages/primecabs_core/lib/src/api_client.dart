// HTTP client for the PrimeCabs API. Every failure surfaces as an [ApiError]
// with the server's message, so screens can show it directly.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

class ApiError implements Exception {
  ApiError(this.status, this.code, this.message, [this.details]);

  final int status;
  final String code;
  final String message;
  final Map<String, dynamic>? details;

  /// Message for one form field from a VALIDATION_FAILED response.
  String? field(String path) {
    final fields = details?['fields'];
    if (fields is! List) return null;
    for (final f in fields) {
      if (f is Map && f['path'] == path) return f['message'] as String?;
    }
    return null;
  }

  int? get attemptsLeft => details?['attemptsLeft'] as int?;

  @override
  String toString() => message;
}

/// A file picked on the device, ready to upload.
class UploadFile {
  const UploadFile({required this.bytes, required this.filename, required this.mimeType});
  final List<int> bytes;
  final String filename;
  final String mimeType;
}

class ApiClient {
  ApiClient({required String baseUrl, this.token, this.onUnauthorized, http.Client? client})
      : base = '${baseUrl.replaceAll(RegExp(r'/$'), '')}/api/v1',
        _http = client ?? http.Client();

  final String base;
  final http.Client _http;
  String? token;
  void Function()? onUnauthorized;

  static const _timeout = Duration(seconds: 20);

  Map<String, String> _headers({bool json = false}) => {
        if (json) 'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      };

  Uri _uri(String path, [Map<String, Object?>? query]) {
    final q = <String, String>{
      for (final e in (query ?? const {}).entries)
        if (e.value != null && e.value.toString().isNotEmpty) e.key: e.value.toString(),
    };
    return Uri.parse('$base$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<dynamic> get(String path, {Map<String, Object?>? query}) => _send(() => _http.get(_uri(path, query), headers: _headers()), path);

  Future<dynamic> post(String path, [Object? body]) =>
      _send(() => _http.post(_uri(path), headers: _headers(json: true), body: jsonEncode(body ?? const {})), path);

  Future<dynamic> put(String path, Object body) => _send(() => _http.put(_uri(path), headers: _headers(json: true), body: jsonEncode(body)), path);

  /// multipart/form-data upload. The API reads the text fields before the file, so they go first.
  Future<dynamic> upload(String path, {required Map<String, String> fields, required UploadFile file}) {
    return _send(() async {
      final req = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers())
        ..fields.addAll(fields)
        ..files.add(http.MultipartFile.fromBytes('file', file.bytes, filename: file.filename, contentType: MediaType.parse(file.mimeType)));
      return http.Response.fromStream(await _http.send(req));
    }, path);
  }

  Future<dynamic> _send(Future<http.Response> Function() request, String path) async {
    http.Response res;
    try {
      res = await request().timeout(_timeout);
    } catch (_) {
      throw ApiError(0, 'NETWORK', 'No internet connection. Check your network and try again.');
    }
    dynamic json;
    try {
      json = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      json = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return json;
    final e = (json is Map ? json['error'] : null) as Map<String, dynamic>? ?? const {};
    if (res.statusCode == 401 && !path.startsWith('/auth/')) onUnauthorized?.call();
    throw ApiError(
      res.statusCode,
      e['code'] as String? ?? 'ERROR',
      e['message'] as String? ?? 'Something went wrong. Try again.',
      e['details'] as Map<String, dynamic>?,
    );
  }
}

/// Message for any error thrown by the API layer.
String errorMessage(Object e) => e is ApiError ? e.message : 'Something went wrong. Try again.';
