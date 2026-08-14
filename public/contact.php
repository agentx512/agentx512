<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// Honeypot: real visitors never fill this hidden field, bots often do
$honeypot = trim($_POST['website'] ?? '');
if ($honeypot !== '') {
    echo json_encode(['ok' => true]);
    exit;
}

function clean_field($value) {
    return str_replace(["\r", "\n"], '', trim((string) $value));
}

$name = clean_field($_POST['name'] ?? '');
$email = clean_field($_POST['email'] ?? '');
$phone = clean_field($_POST['phone'] ?? '');
$message = trim((string) ($_POST['message'] ?? ''));

$errors = [];
if ($name === '' || mb_strlen($name) < 2 || mb_strlen($name) > 100) {
    $errors[] = 'Please enter a valid name.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Please enter a valid email address.';
}
if ($message === '' || mb_strlen($message) < 10 || mb_strlen($message) > 2000) {
    $errors[] = 'Message must be between 10 and 2000 characters.';
}

if ($errors) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => implode(' ', $errors)]);
    exit;
}

$to = 'abdullah.mo.contact@gmail.com';
$subject = 'Portfolio contact from ' . $name;
$body = "Name: $name\nEmail: $email\nPhone: $phone\n\nMessage:\n$message\n";
$headers = 'From: no-reply@' . preg_replace('/[^a-zA-Z0-9.\-]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost') . "\r\n"
    . 'Reply-To: ' . $email . "\r\n"
    . 'Content-Type: text/plain; charset=UTF-8';

$sent = @mail($to, $subject, $body, $headers);

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not send your message right now, please email me directly.']);
}
