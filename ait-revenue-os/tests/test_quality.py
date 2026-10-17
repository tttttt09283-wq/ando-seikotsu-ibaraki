from revenue_os.quality import SEVERITY_ERROR, check_content, x_weighted_length


def _sev(findings):
    return [f.severity for f in findings]


def test_affiliate_requires_disclosure():
    f = check_content("x", "", "これ便利 https://hb.afl.rakuten.co.jp/abc")
    assert SEVERITY_ERROR in _sev(f)
    f2 = check_content("x", "", "【PR】これ便利 https://hb.afl.rakuten.co.jp/abc")
    assert SEVERITY_ERROR not in _sev(f2)


def test_pr_inside_english_word_is_not_disclosure():
    f = check_content("x", "", "great product https://hb.afl.rakuten.co.jp/abc")
    assert SEVERITY_ERROR in _sev(f)


def test_flags_fake_experience_and_exaggeration_and_dm():
    f = check_content("threads", "", "【PR】実際に使ってみたら必ず痩せる！詳しくはDMで", linked_rakuten=True)
    msgs = " ".join(x.message for x in f)
    assert "実際に使" in msgs and "必ず" in msgs and "痩せ" in msgs and "DM" in msgs


def test_price_without_date_warns():
    f = check_content("x", "", "【PR】今なら1,320円です", linked_rakuten=True)
    assert any("確認日時" in x.message for x in f)
    f2 = check_content("x", "", "【PR】1,320円（10/1時点）", linked_rakuten=True)
    assert not any("確認日時" in x.message for x in f2)


def test_x_length():
    assert x_weighted_length("abc") == 3
    assert x_weighted_length("あいう") == 6
    assert any("文字数" in x.message for x in check_content("x", "", "あ" * 141))
